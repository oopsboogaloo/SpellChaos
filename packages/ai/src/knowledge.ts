import type { PlayerView } from '../../views/src/index.js';
import { createMatch, createCreature } from '../../engine/src/index.js';
import type { GameState, Creature } from '../../domain/src/state.js';
export type SeenCreature = PlayerView['creatures'][number];
/** A hypothesis built exclusively from permitted observations. This is never
 * installed as authoritative state and never used to resolve combat. */
export function knowledgeState(view: PlayerView): GameState {
  const s = createMatch(
    view.matchId,
    view.players.map(p => p.id),
    1,
  );
  s.turn = view.turn;
  s.phase = 'planning';
  s.balanceUnits = Math.round(view.balance * 2);
  s.board = { ...view.board };
  s.players = view.players.map(p => ({ ...p, participated: false, missedTurns: 0 }));
  s.creatures = view.creatures.map(c => {
    const own = c.controller === view.self.id ? c.planning : undefined;
    const body = createCreature(c.id, c.controller, c.centre, {
      ...c.traits,
      ...c.stats,
      kind: own?.kind ?? (c.illusion ? 'illusion' : view.players.some(p => p.wizardId === c.id) ? 'wizard' : 'summon'),
      family: c.family,
      species: c.species,
      summonLevel: c.summonLevel,
      size: c.size,
      height: c.height,
      attacks: structuredClone(c.attacks),
      defences: structuredClone(c.defences),
      hp: own ? c.hp! : c.stats.maxHp,
      maxHp: c.stats.maxHp,
      mana: own ? c.mana! : 0,
      maxMana: own ? c.maxMana! : 0,
      spellbook: own ? [...c.spellbook!] : [],
      spellLevelCap: own?.spellLevelCap ?? 0,
      createdSequence: own?.createdSequence ?? 0,
      readyTurn: own?.readyTurn ?? 1,
      bindingLevel: own ? own.bindingLevel : c.controller === null ? null : c.summonLevel,
      incapacitated: own ? !own.ready : c.health === 'incapacitated',
      slowed: own?.slowed ?? false,
      subdued: own?.subdued ?? false,
      restrained: c.restrained || (own?.locksMovement ?? false),
      reload: own ? structuredClone(c.reload ?? null) : null,
      canMarkQuarry: own ? (c.canMarkQuarry ?? false) : false,
      quarryTargetId: own ? (c.quarryTargetId ?? null) : null,
      ...(c.mountId ? { mountId: c.mountId } : {}),
      ...(c.mountable ? { mountable: true } : {}),
      ...(c.canRide ? { canRide: true } : {}),
      ...(c.handlesObjects ? { handlesObjects: true } : {}),
      ...(c.flight ? { flight: structuredClone(c.flight) } : {}),
      ...(c.dive ? { dive: structuredClone(c.dive) } : {}),
      ...(c.blink ? { blink: structuredClone(c.blink) } : {}),
      ...(c.blinkUsedTurn ? { blinkUsedTurn: c.blinkUsedTurn } : {}),
      ...(c.haunt ? { haunt: structuredClone(c.haunt) } : {}),
      ...(c.seeInvisibleRange ? { seeInvisibleRange: c.seeInvisibleRange } : {}),
      ...(c.spores ? { spores: structuredClone(c.spores) } : {}),
      ...(c.wail ? { wail: structuredClone(c.wail) } : {}),
      ...(c.wailReadyTurn ? { wailReadyTurn: c.wailReadyTurn } : {}),
      ...(c.fearAction ? { fearAction: structuredClone(c.fearAction) } : {}),
      ...(c.gaze ? { gaze: structuredClone(c.gaze) } : {}),
      ...(c.rootNetwork ? { rootNetwork: structuredClone(c.rootNetwork) } : {}),
      ...(c.rangedCover ? { rangedCover: structuredClone(c.rangedCover) } : {}),
      ...(c.pounce ? { pounce: structuredClone(c.pounce) } : {}),
      ...(c.shove ? { shove: structuredClone(c.shove) } : {}),
      ...(c.drag ? { drag: structuredClone(c.drag) } : {}),
      ...(c.constriction ? { constriction: structuredClone(c.constriction) } : {}),
    });
    if (own)
      body.conditions = own.fearSourceIds.map(sourceId => ({
        kind: 'Fear',
        sourceId,
        illusionId: null,
        potency: 0,
        resistance: 'int',
        duration: 1,
        requiresDamage: false,
        startsTurn: s.turn,
        endsTurn: s.turn,
        activatesTurn: null,
        active: true,
      }));
    return body;
  });
  // If a carrier is hidden, its rider's visible occupied cells still define the
  // observed body. Avoid dangling references without inventing a hidden identity.
  for (const c of s.creatures)
    if (c.mountId && !s.creatures.some(m => m.id === c.mountId)) {
      delete c.mountId;
      const seen = view.creatures.find(t => t.id === c.id)!;
      c.size =
        seen.occupied.length > 1
          ? Math.min(10, 2 * Math.round((Math.sqrt((4 * seen.occupied.length - 1) / 3) - 1) / 2) + 1)
          : c.size;
    }
  s.walls = structuredClone(view.walls);
  s.tangleweed = view.tangleweed.map(w => ({ ...structuredClone(w), casterId: view.players[0]!.wizardId }));
  s.darkness = view.darkness.map(d => ({ ...structuredClone(d), casterId: view.players[0]!.wizardId }));
  s.casts = structuredClone(view.casts);
  s.orders = [];
  s.reservations = [];
  s.corpses = view.corpses.map(c => ({
    id: c.id,
    creatureId: c.creatureId,
    centre: { ...c.centre },
    size: c.size,
    con: c.con,
    maxHp: c.maxHp,
    skeletal: c.skeletal,
    restorationUsed: c.restorationUsed,
    fireAcidDamage: c.skeletal ? c.maxHp : 0,
  }));
  for (const c of view.corpses)
    if (!s.creatures.some(t => t.id === c.creatureId))
      s.creatures.push(
        createCreature(c.creatureId, null, c.centre, {
          ...c.traits,
          kind: c.wizard ? 'wizard' : 'summon',
          size: c.size,
          con: c.con,
          hp: -c.maxHp,
          maxHp: c.maxHp,
          alive: false,
          species: c.species,
          family: c.family,
          summonLevel: c.summonLevel,
          attacks: structuredClone(c.attacks),
          restorationUsed: c.restorationUsed,
          ...(c.flight ? { flight: structuredClone(c.flight) } : {}),
        }),
      );
  return s;
}
