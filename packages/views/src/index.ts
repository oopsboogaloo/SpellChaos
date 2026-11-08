import { active, afterEarlyWake, slowed, subdued } from '../../engine/src/status.js';
import { castingLocksMovement } from '../../engine/src/casting.js';
import { carryingLocked } from '../../engine/src/mounts.js';
import type { Creature } from '../../domain/src/state.js';
import { bodyFootprint } from '../../engine/src/bodies.js';
import { visibleTo } from '../../engine/src/visibility.js';
import { knowsIllusion } from '../../engine/src/illusions.js';
import { health, restrained } from '../../engine/src/status.js';
import type { Event } from '../../engine/src/events.js';
import type { GameState } from '../../domain/src/state.js';
/** Listed/apparent body properties; no readiness, wounds or illusion provenance. */
function publicTraits(c: Creature) {
  return {
    undead: c.undead,
    undeadClass: c.undeadClass,
    plant: c.plant,
    construct: c.construct,
    swarm: c.swarm,
    incorporeal: c.incorporeal,
    ...(c.passCreatures ? { passCreatures: true } : {}),
    nimble: c.nimble,
    flammable: c.flammable,
    packTactics: c.packTactics,
    grappleLimbs: c.grappleLimbs,
    grappleEqualSize: c.grappleEqualSize,
    doubleAction: c.doubleAction,
    attackTraits: structuredClone(c.attackTraits),
    regeneration: c.regeneration,
    bristles: c.bristles,
    lifeDrain: c.lifeDrain,
    darknessSightRange: c.darknessSightRange,
    ignoresDarknessDisadvantage: c.ignoresDarknessDisadvantage,
    familiar: c.familiar,
    reanimationAttackIds: structuredClone(c.reanimationAttackIds),
  };
}
function planningView(s: GameState, c: Creature, playerId: string) {
  const awake = afterEarlyWake(c, s.turn),
    fears = c.conditions
      .filter(e => e.kind === 'Fear' && e.active)
      .map(e => s.creatures.find(t => t.id === e.sourceId && t.alive))
      .filter((t): t is Creature => !!t);
  return {
    kind: c.kind,
    readyTurn: c.readyTurn,
    ready: active(awake) && c.readyTurn <= s.turn,
    earlyReady: active(c) && c.readyTurn <= s.turn,
    slowed: slowed(awake),
    subdued: subdued(awake),
    spellLevelCap: c.spellLevelCap,
    createdSequence: c.createdSequence,
    bindingLevel: c.bindingLevel,
    manaRegen: c.manaRegen,
    locksMovement: castingLocksMovement(s, c, true) || carryingLocked(s, c, true),
    fearUnknown: fears.some(t => !visibleTo(s, t, playerId)),
    fearSourceIds: fears.filter(t => visibleTo(s, t, playerId)).map(t => t.id),
  };
}
export function projectView(state: GameState, playerId: string) {
  const player = state.players.find(p => p.id === playerId);
  if (!player) throw new Error('UNKNOWN_PLAYER');
  return {
    matchId: state.matchId,
    turn: state.turn,
    phase: state.phase,
    balance: state.balanceUnits / 2,
    self: { id: player.id, locked: player.locked },
    board: { ...state.board },
    players: state.players.map(p => ({ id: p.id, wizardId: p.wizardId, locked: p.locked, eliminated: p.eliminated })),
    walls: structuredClone(state.walls.map(({ casterId: _caster, ...w }) => w)),
    tangleweed: structuredClone(state.tangleweed.map(({ casterId: _caster, ...w }) => w)),
    darkness: structuredClone(state.darkness.map(({ casterId: _caster, ...d }) => d)),
    creatures: state.creatures
      .filter(c => c.alive && visibleTo(state, c, playerId))
      .map(c => ({
        id: c.id,
        centre: { ...c.centre },
        size: c.size,
        controller: c.controller,
        height: c.height,
        species: c.species,
        family: c.family,
        summonLevel: c.summonLevel,
        traits: publicTraits(c),
        stats: { con: c.con, dex: c.dex, intelligence: c.intelligence, move: c.move, maxHp: c.maxHp },
        attacks: structuredClone(c.attacks),
        occupied: bodyFootprint(state, c),
        ...(c.mountId &&
        visibleTo(
          state,
          state.creatures.find(m => m.id === c.mountId)!,
          playerId,
        )
          ? { mountId: c.mountId }
          : {}),
        ...(c.mountable ? { mountable: true } : {}),
        ...(c.canRide ? { canRide: true } : {}),
        ...(c.handlesObjects ? { handlesObjects: true } : {}),
        ...(c.dive ? { dive: structuredClone(c.dive) } : {}),
        ...(c.flight ? { flight: structuredClone(c.flight) } : {}),
        ...(c.haunt ? { haunt: structuredClone(c.haunt) } : {}),
        ...(c.seeInvisibleRange ? { seeInvisibleRange: c.seeInvisibleRange } : {}),
        ...(c.drag ? { drag: structuredClone(c.drag) } : {}),
        ...(c.constriction ? { constriction: structuredClone(c.constriction) } : {}),
        ...(c.rootNetwork ? { rootNetwork: structuredClone(c.rootNetwork) } : {}),
        ...(c.rangedCover ? { rangedCover: structuredClone(c.rangedCover) } : {}),
        ...(c.blink ? { blink: structuredClone(c.blink) } : {}),
        ...(c.spores ? { spores: structuredClone(c.spores) } : {}),
        ...(c.wail ? { wail: structuredClone(c.wail) } : {}),
        ...(c.fearAction ? { fearAction: structuredClone(c.fearAction) } : {}),
        ...(c.gaze ? { gaze: structuredClone(c.gaze) } : {}),
        ...(c.shove ? { shove: structuredClone(c.shove) } : {}),
        ...(c.pounce ? { pounce: structuredClone(c.pounce) } : {}),
        defences: structuredClone(c.defences),
        ...(knowsIllusion(c, playerId) ? { illusion: true } : {}),
        health: health(c),
        restrained: restrained(state, c),
        ...(c.controller === playerId
          ? {
              ...(c.blinkUsedTurn === undefined ? {} : { blinkUsedTurn: c.blinkUsedTurn }),
              ...(c.wailReadyTurn === undefined ? {} : { wailReadyTurn: c.wailReadyTurn }),
              planning: planningView(state, c, playerId),
              hp: c.hp,
              maxHp: c.maxHp,
              mana: c.mana,
              maxMana: c.maxMana,
              spellbook: [...c.spellbook],
              reload: structuredClone(c.reload),
              canMarkQuarry: c.canMarkQuarry,
              quarryTargetId: c.quarryTargetId,
            }
          : {}),
      })),
    corpses: state.corpses
      .filter(body =>
        visibleTo(
          state,
          { ...state.creatures.find(c => c.id === body.creatureId)!, centre: body.centre, size: body.size },
          playerId,
        ),
      )
      .map(c => {
        const body = state.creatures.find(t => t.id === c.creatureId)!;
        return {
          id: c.id,
          creatureId: body.id,
          centre: { ...c.centre },
          size: c.size,
          con: c.con,
          maxHp: c.maxHp,
          skeletal: c.skeletal,
          restorationUsed: c.restorationUsed,
          species: body.species,
          family: body.family,
          summonLevel: body.summonLevel,
          wizard: state.players.some(p => p.wizardId === body.id),
          traits: publicTraits(body),
          attacks: structuredClone(body.attacks),
          ...(body.flight ? { flight: structuredClone(body.flight) } : {}),
        };
      }),
    holds: structuredClone(
      state.holds.filter(h => {
        const a = state.creatures.find(c => c.id === h.grapplerId)!,
          b = state.creatures.find(c => c.id === h.targetId)!;
        return (
          (a.controller === playerId || b.controller === playerId) &&
          visibleTo(state, a, playerId) &&
          visibleTo(state, b, playerId)
        );
      }),
    ),
    casts: structuredClone(state.casts.filter(c => c.controller === playerId)),
    orders: structuredClone(
      state.orders.filter(o => state.creatures.find(c => c.id === o.creatureId)?.controller === playerId),
    ),
    reservations: structuredClone(
      state.reservations.filter(r => state.creatures.find(c => c.id === r.creatureId)?.controller === playerId),
    ),
    intents: structuredClone(
      state.intents.filter(i => state.creatures.find(c => c.id === i.creatureId)?.controller === playerId),
    ),
    result: structuredClone(state.result),
  };
}

/** Hide exact enemy damage and authoritative sequence gaps from private detection. */
export function projectEvents(
  state: GameState,
  playerId: string,
  events: readonly Event[],
): Omit<Event, 'sequence' | 'audience'>[] {
  if (!state.players.some(p => p.id === playerId)) throw new Error('UNKNOWN_PLAYER');
  const owned = (id: string | undefined) => state.creatures.some(c => c.id === id && c.controller === playerId);
  return events
    .filter(event => !event.audience || event.audience.includes(playerId))
    .filter(event => event.type !== 'IllusionDetected' || event.playerId === playerId)
    .map(event => {
      const { sequence: _authoritativeSequence, audience: _audience, ...copy } = structuredClone(event);
      if (!owned(event.creatureId)) delete copy.amount;
      // Name a damage source only if this player can see it.
      if (copy.sourceId) {
        const source = state.creatures.find(c => c.id === copy.sourceId);
        if (!source || !(source.controller === playerId || visibleTo(state, source, playerId))) delete copy.sourceId;
      }
      if (copy.damageByTarget) copy.damageByTarget = copy.damageByTarget.filter(d => owned(d.targetId));
      return copy;
    });
}

export type PlayerView = ReturnType<typeof projectView>;
