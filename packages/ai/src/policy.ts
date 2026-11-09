import { effectChance } from '../../engine/src/damage.js';
import { clearProjectile } from '../../geometry/src/walls.js';
import type { PlayerView } from '../../views/src/index.js';
import type { Creature, GameState, Order } from '../../domain/src/state.js';
import type { AttackAction, AttackDefinition } from '../../domain/src/combat.js';
import type { CastAction } from '../../domain/src/spells.js';
import { knowledgeState, type SeenCreature } from './knowledge.js';
import { routeTowards } from '../../engine/src/navigation.js';
import { meleeHeightAllowed } from '../../domain/src/combat.js';
import { bodyFootprint } from '../../engine/src/bodies.js';
import { arenaOf, defaultOrder, movementAllowance, validateOrder } from '../../engine/src/orders.js';
import { placement, traceProjectile } from '../../geometry/src/occupancy.js';
import { add, disk, nearestPair, DIRECTIONS, compareHex, overlap, type Hex } from '../../geometry/src/hex.js';
import { sight } from '../../engine/src/visibility.js';
import { blinkLegal } from '../../engine/src/blink.js';
import { selectOrigin } from '../../engine/src/casting.js';
import { hitChance, damageMultiplier } from '../../engine/src/damage.js';
import { randomBelow } from '../../domain/src/random.js';
import { manaCost, successChance, castingTime, mvpSpellFamilies } from '../../content/src/spells.js';
import { summonProfile } from '../../content/src/summons.js';
import { createCreature } from '../../engine/src/index.js';

export const POLICY_VERSION = 'fair-ai-0.1' as const;
export const MAX_POLICY_WORK = 10000000;
export type Difficulty = 'easy' | 'standard' | 'hard';
export interface PolicyOptions {
  difficulty?: Difficulty;
  maxWork?: number;
}
export interface PolicyResult {
  orders: Order[];
  seed: number;
  work: number;
  candidates: number;
  expanded: number;
  truncated: boolean;
  policyVersion: typeof POLICY_VERSION;
}
const limits = {
  easy: { nodes: 64, candidates: 48, targets: 2 },
  standard: { nodes: 144, candidates: 96, targets: 3 },
  hard: { nodes: 256, candidates: 160, targets: 4 },
} as const;
const distance = (s: GameState, a: Creature, b: Creature) =>
  nearestPair(bodyFootprint(s, a), bodyFootprint(s, b)).distance;
const isMelee = (a: AttackDefinition) => ['melee', 'swarm', 'cleave'].includes(a.mode);
function reaches(s: GameState, c: Creature, t: Creature, a: AttackDefinition) {
  const p = nearestPair(bodyFootprint(s, c), bodyFootprint(s, t));
  return (
    p.distance >= a.minRange &&
    p.distance <= a.range &&
    (!isMelee(a) || meleeHeightAllowed(c, t, p.distance)) &&
    sight(s, c, p.from, p.to, 'left') &&
    (!isMelee(a) || clearProjectile(p.from, p.to, 'left', s.walls))
  );
}
function attackAction(s: GameState, c: Creature, t: Creature, a: AttackDefinition): AttackAction {
  return {
    type: 'Attack',
    attackId: a.id,
    targetIds: ['area', 'swarm', 'cleave'].includes(a.mode) ? [] : [t.id],
    ground: a.mode === 'area' ? nearestPair(bodyFootprint(s, c), bodyFootprint(s, t)).to : null,
    side: 'left',
  };
}
const posed = (s: GameState, c: Creature) => ({ ...s, creatures: s.creatures.map(t => (t.id === c.id ? c : t)) });

/** Pure, bounded view-only decisions. No authoritative state or validation
 * callback is accepted. All hypotheses are constructed from this observation. */
export function planWizardTurn(view: PlayerView, seed: number, options: PolicyOptions = {}): PolicyResult {
  const difficulty = options.difficulty ?? 'standard',
    budget = options.maxWork ?? 100000;
  if (!(difficulty in limits) || !Number.isInteger(budget) || budget < 0 || budget > MAX_POLICY_WORK)
    throw new Error('INVALID_POLICY_OPTIONS');
  randomBelow(seed, 1); // validate explicit seed, without consuming the stream
  if (view.phase !== 'planning') throw new Error('AI_PLANNING_ONLY');
  if (view.self.locked || view.players.find(p => p.id === view.self.id)?.eliminated)
    return { orders: [], seed, work: 0, candidates: 0, expanded: 0, truncated: false, policyVersion: POLICY_VERSION };
  const s = knowledgeState(view),
    config = limits[difficulty],
    orders: Order[] = [];
  let work = 0,
    candidates = 0,
    expanded = 0,
    truncated = false;
  const spend = (n = 1) => {
    if (work + n > budget) {
      truncated = true;
      return false;
    }
    work += n;
    return true;
  };
  const seenById = new Map(view.creatures.map(c => [c.id, c]));
  const wizardIds = new Set(view.players.map(p => p.wizardId));
  const owned = view.creatures
    .filter(c => c.controller === view.self.id)
    .sort((a, b) => Number(wizardIds.has(b.id)) - Number(wizardIds.has(a.id)) || (a.id < b.id ? -1 : 1));
  const enemies = s.creatures.filter(c => c.alive && c.controller !== view.self.id);
  const targetBonus = (t: Creature) => (wizardIds.has(t.id) ? 10 : 2);
  // Chance (0–1) that a power of this potency beats the target's resistance.
  const works = (potency: number, resistance: number) => effectChance(potency, resistance) / 100;
  for (const seen of owned) {
    if (!seen.planning?.ready) continue;
    if (!spend()) break;
    const c = s.creatures.find(c => c.id === seen.id)!,
      own = seen.planning;
    const closest = [...enemies].sort((a, b) => distance(s, c, a) - distance(s, c, b) || (a.id < b.id ? -1 : 1));
    const goal = [...enemies].sort(
      (a, b) =>
        Number(wizardIds.has(b.id)) - Number(wizardIds.has(a.id)) ||
        distance(s, c, a) - distance(s, c, b) ||
        (a.id < b.id ? -1 : 1),
    )[0];
    const ranked: { order: Order; score: number }[] = [];
    let count = 0;
    const positionScore = (body: Creature) => {
      const progress = goal ? (distance(s, c, goal) - distance(s, body, goal)) * 0.8 : 0;
      const threats = closest
        .filter(t => t.height === body.height && distance(s, body, t) <= 2)
        .reduce(
          (n, t) =>
            n +
            Math.max(
              0,
              ...t.attacks.flatMap(a => a.shots.map(hit => hit.components.reduce((v, x) => v + x.amount, 0))),
            ),
          0,
        );
      return progress - threats * (wizardIds.has(c.id) ? 0.2 : 0.04);
    };
    const addCandidate = (order: Order, score: number) => {
      if (count >= config.candidates || !spend()) return;
      count++;
      candidates++;
      try {
        validateOrder(s, order, view.self.id);
      } catch {
        return;
      }
      const draw = randomBelow(seed, 1000);
      seed = draw.state;
      const jitter = (draw.value / 1000) * (difficulty === 'easy' ? 2 : 0.25);
      ranked.push({ order: structuredClone(order), score: score + jitter });
    };
    const empty: Order = { creatureId: c.id, path: [], early: null, late: null };
    addCandidate(empty, -0.5);
    addCandidate(defaultOrder(c.id), 0);
    if (c.restrained)
      addCandidate({ ...empty, early: own.earlyReady ? 'Escape' : null, late: own.earlyReady ? null : 'Escape' }, 8);
    if (c.reload && !c.reload.loaded && c.reload.lastFiredTurn !== s.turn)
      addCandidate(
        {
          ...empty,
          early: own.earlyReady ? { type: 'Reload' } : null,
          late: own.earlyReady ? null : { type: 'Reload' },
        },
        10,
      );
    let path: Hex[] = [],
      flightSteps: Order['flightSteps'];
    const allowance = movementAllowance(c, empty);
    if (
      goal &&
      allowance > 0 &&
      !c.mountId &&
      !c.restrained &&
      !own.locksMovement &&
      !own.fearUnknown &&
      budget - work >= config.nodes
    ) {
      const range = Math.max(
        1,
        ...c.attacks.map(a => a.range),
        c.mana >= 5 && c.spellbook.some(x => ['Magic Bolt', 'Fire Bolt', 'Magic Attack'].includes(x)) ? 6 : 1,
      );
      const route = routeTowards(
        s,
        c,
        allowance,
        b => Math.max(0, distance(s, b, goal) - range),
        b =>
          c.attacks.some(a => reaches(s, b, goal, a)) ||
          (range > 1 &&
            distance(s, b, goal) <= range &&
            sight(
              s,
              b,
              nearestPair(bodyFootprint(s, b), bodyFootprint(s, goal)).from,
              nearestPair(bodyFootprint(s, b), bodyFootprint(s, goal)).to,
              'left',
            )),
        Math.min(config.nodes, budget - work),
      );
      spend(route.expanded);
      expanded += route.expanded;
      path = route.path;
      flightSteps = route.flightSteps;
    }
    const movement: Order = { ...empty, path, ...(flightSteps ? { flightSteps } : {}) },
      end = { ...c, centre: path.at(-1) ?? c.centre, height: flightSteps?.at(-1)?.height ?? c.height };
    if (path.length) addCandidate(movement, positionScore(end));
    const targets = closest.slice(0, config.targets);
    for (const phase of ['early', 'late'] as const) {
      if (phase === 'early' && !own.earlyReady) continue;
      const body = phase === 'early' ? c : end,
        world = posed(s, body),
        base = phase === 'early' ? empty : movement;
      const offer = (action: Order['early'], score: number) =>
        addCandidate({ ...base, [phase]: action }, score + (phase === 'late' ? positionScore(end) : 0));
      for (const a of c.attacks) {
        const eligible = targets.filter(t => reaches(world, body, t, a));
        for (const t of eligible) {
          let victims = [t],
            blocked = false;
          if (a.mode === 'area') {
            const impact = nearestPair(bodyFootprint(world, body), bodyFootprint(world, t)).to;
            victims = world.creatures.filter(v => v.alive && overlap(disk(impact, a.radius), bodyFootprint(world, v)));
          } else if (a.mode === 'swarm' || a.mode === 'cleave')
            victims = world.creatures.filter(
              v =>
                v.id !== c.id &&
                v.alive &&
                (a.targetTeams === 'all' || v.controller !== c.controller) &&
                reaches(world, body, v, a),
            );
          else if (a.mode === 'projectile') {
            const ray = traceProjectile(
              arenaOf(world),
              body,
              nearestPair(bodyFootprint(world, body), bodyFootprint(world, t)).to,
              t.height,
              'left',
              t.id,
            );
            victims = world.creatures.filter(v => v.id === ray.hit);
            blocked = ray.blockedBy !== null;
          }
          const score = victims.reduce(
            (sum, v) => {
              const damage = a.shots.reduce(
                (n, hit) =>
                  n +
                  hit.components.reduce(
                    (x, d) => x + d.amount * damageMultiplier(v, d.type, a.mode === 'area' || a.areaDamage === true),
                    0,
                  ) *
                    (a.mode === 'area' ? 1 : hitChance(hit.skill, v.dex) / 100),
                0,
              );
              return (
                sum +
                (v.controller === c.controller
                  ? -2 * damage
                  : damage + targetBonus(v) + (seenById.get(v.id)?.health === 'critical' ? 3 : 0))
              );
            },
            blocked ? 2 : 0,
          );
          const action = attackAction(world, body, t, a);
          offer(action, score);
          if (c.doubleAction && own.earlyReady && !c.subdued && reaches(s, c, t, a))
            addCandidate(
              { ...movement, early: attackAction(s, c, t, a), late: action },
              score * 1.7 + positionScore(end),
            );
          if (phase === 'early' && path.length && !c.subdued)
            addCandidate({ ...movement, early: action }, score + positionScore(end));
          if (['swarm', 'cleave'].includes(a.mode)) break;
        }
      }
      if (c.fearAction?.kind === 'Roar')
        offer({ type: 'Roar' }, targets.filter(t => distance(world, body, t) <= c.fearAction!.range).length * 3);
      if (c.wail && (c.wailReadyTurn ?? 1) <= s.turn) {
        const victims = targets.filter(t => distance(world, body, t) <= c.wail!.range);
        const allies = s.creatures.filter(
          t => t.id !== c.id && t.controller === c.controller && distance(world, body, t) <= c.wail!.range,
        );
        offer({ type: 'Wail' }, victims.length * 6 - allies.length * 4);
      }
      if (c.rootNetwork)
        offer(
          { type: 'RootNetwork' },
          targets.filter(t => t.size < c.size && t.height === 'ground' && distance(world, body, t) <= 1).length * 4,
        );
      for (const t of targets) {
        // A power is worth its chance of working against the target's resistance times what the effect is
        // worth, so the AI attacks when that is better, and never re-gazes a target already held (#60).
        if (c.gaze && !t.restrained && distance(world, body, t) <= c.gaze.range)
          offer({ type: 'Gaze', targetId: t.id }, works(c.gaze.potency, t.intelligence) * (3 + targetBonus(t)));
        if (
          c.fearAction?.kind === 'Frighten' &&
          t.intelligence > 0 &&
          !t.construct &&
          distance(world, body, t) <= c.fearAction.range
        )
          offer(
            { type: 'Frighten', targetId: t.id },
            works(c.fearAction.potency, t.intelligence) * (2 + targetBonus(t)),
          );
        if (c.spores && !t.undead && !t.construct && !t.plant && distance(world, body, t) <= c.spores.range)
          offer({ type: 'Spores', targetId: t.id }, works(c.spores.potency, t.con) * (5 + targetBonus(t)));
        if (c.canMarkQuarry && c.quarryTargetId !== t.id)
          offer({ type: 'MarkQuarry', targetId: t.id }, distance(world, body, t) <= 2 ? 5 : 1);
      }
      if (c.attacks[0] && phase === 'early')
        offer({ type: 'Guard', attackId: c.attacks[0].id, targetId: null, area: [] }, 1);
      if (c.haunt) for (const ground of disk(body.centre, 2).slice(1, 4)) offer({ type: 'Haunt', ground }, 0.3);
      if (c.canRide && !c.mountId)
        for (const m of s.creatures.filter(
          t =>
            t.controller === c.controller &&
            t.mountable &&
            t.height === 'ground' &&
            t.size > c.size &&
            distance(world, body, t) <= 1,
        ))
          offer({ type: 'Mount', targetId: m.id }, 2 + Math.max(0, m.move - c.move));
      if (c.mountId) {
        const carrier = s.creatures.find(t => t.id === c.mountId)!;
        for (const ground of disk(carrier.centre, 2).sort(compareHex).slice(0, 12))
          offer({ type: 'Dismount', ground }, carrier.hp <= 0 ? 6 : -1);
      }
    }
    if (c.blink && c.blinkUsedTurn !== s.turn && !c.subdued && !own.fearUnknown && goal) {
      const cells = disk(c.centre, 3)
        .filter(h => blinkLegal(s, c, c.centre, h))
        .sort(
          (a, b) => distance(s, { ...c, centre: a }, goal) - distance(s, { ...c, centre: b }, goal) || compareHex(a, b),
        )
        .slice(0, 3);
      for (const to of cells) {
        const body = { ...c, centre: to },
          a = c.attacks.find(a => reaches(s, body, goal, a));
        addCandidate(
          { ...empty, path: [to], blinkIndex: 0, late: a ? attackAction(s, body, goal, a) : null },
          positionScore(body) + (a ? 8 : 0),
        );
      }
    }
    if (c.spellbook.length && c.mana >= 2) {
      const book = [...c.spellbook]
        .filter(x => mvpSpellFamilies.includes(x))
        .sort(
          (a, b) => Number(a.startsWith('Summon ')) - Number(b.startsWith('Summon ')) || (a < b ? -1 : a > b ? 1 : 0),
        );
      const levels = [
        ...new Set([1, Math.min(3, c.spellLevelCap), Math.min(5, c.spellLevelCap), Math.min(8, c.spellLevelCap)]),
      ]
        .filter(l => l > 0 && l <= c.spellLevelCap && 5 * l <= c.mana)
        .sort((a, b) => a - b);
      const offerCast = (cast: CastAction, score: number) => {
        if (manaCost(cast) > c.mana) return;
        for (const phase of ['early', 'late'] as const) {
          if (phase === 'early' && !own.earlyReady) continue;
          const body = phase === 'early' ? c : end;
          const world = posed(s, body),
            origin = selectOrigin(world, body, cast);
          if (!origin) continue;
          let expectedScore = score;
          if (cast.spell === 'Magic Bolt' || cast.spell === 'Fire Bolt') {
            const selected = world.creatures.find(t => t.id === cast.targetId),
              aim =
                cast.ground ??
                (selected ? nearestPair(bodyFootprint(world, origin), bodyFootprint(world, selected)).to : null);
            if (aim) {
              const ray = traceProjectile(
                  arenaOf(world),
                  origin,
                  aim,
                  selected?.height ?? 'ground',
                  cast.side,
                  selected?.id,
                ),
                hit = world.creatures.find(t => t.id === ray.hit);
              if (hit?.controller === c.controller)
                expectedScore = -(cast.level + 2) * 2 - (hit.hp <= cast.level + 2 ? 20 : 0);
              else if (ray.blockedBy) expectedScore = 2;
            }
          }
          if (cast.spell === 'Magic Attack') {
            const primary = world.creatures.find(t => t.id === cast.targetId);
            if (primary)
              expectedScore -= world.creatures
                .filter(
                  v =>
                    v.controller === c.controller &&
                    v.family === primary.family &&
                    distance(world, primary, v) <= cast.level + 3,
                )
                .reduce((n, v) => n + (cast.level + 1) * 2 + (v.hp <= cast.level + 1 ? 20 : 0), 0);
          }
          const base = phase === 'early' ? empty : movement,
            scoreAt = (expectedScore * successChance(cast, s.balanceUnits)) / 100 - manaCost(cast) * 0.06;
          addCandidate({ ...base, [phase]: cast }, scoreAt + (phase === 'late' ? positionScore(end) : 0));
          if (phase === 'early' && path.length && ['instant', 'quick'].includes(castingTime(cast.spell)))
            addCandidate({ ...movement, early: cast }, scoreAt + positionScore(end));
        }
      };
      for (const spell of book) {
        if (count >= config.candidates || truncated) break;
        for (const level of spell === 'Disbelief' ? [1] : levels) {
          const cast: CastAction = {
            type: 'Cast',
            spell,
            level,
            variant: 'bound',
            targetId: null,
            ground: null,
            side: 'left',
          };
          if (['Magic Bolt', 'Fire Bolt', 'Magic Attack'].includes(spell))
            for (const t of targets)
              offerCast(
                { ...cast, targetId: t.id },
                targetBonus(t) + level + 2 + (seenById.get(t.id)?.health === 'critical' ? 4 : 0),
              );
          else if (spell === 'Disbelief')
            for (const t of targets) offerCast({ ...cast, targetId: t.id }, seenById.get(t.id)?.illusion ? 14 : 1);
          else if (spell === 'Healing Bolt')
            for (const ally of s.creatures
              .filter(t => t.controller === c.controller && !t.undead && t.kind !== 'illusion' && t.hp < t.maxHp)
              .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
              .slice(0, 2))
              offerCast(
                { ...cast, targetId: ally.id },
                Math.min(level + 3, ally.maxHp - ally.hp) + (wizardIds.has(ally.id) ? 7 : 2),
              );
          else if (spell === 'Bind' || spell === 'Release') {
            for (const t of targets)
              if (t.kind !== 'wizard' && t.summonLevel <= level)
                offerCast({ ...cast, targetId: t.id }, spell === 'Bind' ? 6 + t.maxHp * 0.15 : 3 + t.maxHp * 0.1);
          } else if (spell === 'Reanimate')
            for (const corpse of view.corpses
              .filter(t => t.summonLevel <= level && !t.wizard && !t.restorationUsed)
              .slice(0, 2))
              offerCast({ ...cast, targetId: corpse.id }, 7 + corpse.maxHp * 0.1);
          else if (spell.startsWith('Summon ')) {
            const profile = summonProfile(spell, level);
            if (!profile) continue;
            const cells = disk(c.centre, 4)
              .filter(h => placement(arenaOf(s), createCreature('ai-preview', c.controller, h, profile), h).legal)
              .sort(
                (a, b) =>
                  (goal ? distance(s, { ...c, centre: a }, goal) - distance(s, { ...c, centre: b }, goal) : 0) ||
                  compareHex(a, b),
              )
              .slice(0, 2);
            const allied = s.creatures.filter(t => t.controller === c.controller && t.kind !== 'wizard').length;
            for (const ground of cells) offerCast({ ...cast, ground }, Math.max(1, 8 + level * 0.6 - allied * 0.6));
            if (cells[0])
              offerCast(
                { ...cast, ground: cells[0], variant: 'illusion' },
                Math.max(1, 5 + level * 0.4 - allied * 0.8),
              );
          } else if (spell === 'Teleport') {
            const critical = c.hp * 3 < c.maxHp,
              safety = (h: Hex) =>
                closest.length ? Math.min(...closest.map(t => distance(s, { ...c, centre: h }, t))) : 0;
            const cells = disk(c.centre, 2 + 2 * level)
              .filter(h => placement(arenaOf(s), c, h).legal)
              .sort(
                (a, b) =>
                  (critical
                    ? safety(b) - safety(a)
                    : positionScore({ ...c, centre: b }) - positionScore({ ...c, centre: a })) || compareHex(a, b),
              );
            if (cells[0])
              offerCast(
                { ...cast, ground: cells[0] },
                critical
                  ? 10 + Math.max(0, safety(cells[0]) - safety(c.centre))
                  : positionScore({ ...c, centre: cells[0] }),
              );
          } else if (spell === 'Darkness') offerCast({ ...cast, ground: c.centre }, c.hp * 3 < c.maxHp ? 7 : 0);
          else if (spell === 'Tangleweed' && targets[0]) {
            const hexes = disk(targets[0].centre, level).slice(0, level);
            offerCast(
              { ...cast, ground: hexes[0]!, hexes },
              4 + targets.filter(t => distance(s, c, t) <= 8 && t.height === 'ground').length,
            );
          } else if (spell === 'Wall')
            for (const d of DIRECTIONS.slice(0, 2))
              offerCast(
                { ...cast, ground: c.centre, edges: [{ a: c.centre, b: add(c.centre, d) }] },
                c.hp * 3 < c.maxHp ? 6 : 0,
              );
        }
      }
    }
    ranked.sort((a, b) => b.score - a.score);
    orders.push(ranked[0]?.order ?? empty);
    if (truncated) break;
  }
  return { orders, seed, work, candidates, expanded, truncated, policyVersion: POLICY_VERSION };
}
