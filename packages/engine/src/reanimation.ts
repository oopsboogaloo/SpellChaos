import type { Creature, GameState } from '../../domain/src/state.js';
import { createCreature } from './index.js';
import { placement } from '../../geometry/src/occupancy.js';
import { arenaOf } from './orders.js';

/** The corpse owns the restoration opportunity; the descendant also retains it. */
export function reanimationBody(s: GameState, corpseId: string, level: number): Creature | null {
 const corpse = s.corpses.find(c => c.id === corpseId);
 if (!corpse || corpse.restorationUsed) return null;
 const body = s.creatures.find(c => c.id === corpse.creatureId);
 if (!body || body.alive || body.restorationUsed || body.kind === 'wizard' || body.kind === 'illusion' ||
     body.plant || body.construct || body.swarm || !body.corpseEligible || body.summonLevel > level) return null;
 return body;
}

/** Explicit body attack metadata prevents magic powers becoming zombie basic attacks. */
export function reanimatedProfile(body: Creature, skeletal: boolean): Partial<Creature> {
 const halve = (n: number) => n === 0 ? 0 : Math.max(1, Math.floor(n / 2));
 const attacks = structuredClone(body.attacks.filter(a => body.reanimationAttackIds===null || body.reanimationAttackIds.includes(a.id)));
 for (const attack of attacks) for (const shot of attack.shots) {
  shot.secondary = shot.secondary.filter(e => !['Poisoned', 'Disease'].includes(e.kind));
 }
 return {
  kind: 'reanimated', species: `${body.species} ${skeletal ? 'skeleton' : 'zombie'}`, family: body.family,
  size: body.size, con: body.con, maxHp: body.size * body.con, hp: body.size * body.con,
  move: skeletal ? body.move : halve(body.move), dex: skeletal ? body.dex : halve(body.dex),
  intelligence: body.intelligence, height: body.height, ...(body.flight?{flight:structuredClone(body.flight)}:{}), summonLevel: body.summonLevel,
  attacks, reanimationAttackIds: attacks.map(a => a.id), defences: structuredClone(body.defences),
  undead: true, undeadClass: skeletal ? 'skeleton' : 'zombie', restorationUsed: true,
  attackTraits: {...body.attackTraits,rallySource:false},
  packTactics: body.packTactics, grappleLimbs: body.grappleLimbs, grappleEqualSize: body.grappleEqualSize,
  ...(body.mountable?{mountable:true}:{}),...(body.canRide?{canRide:true}:{}),...(body.handlesObjects?{handlesObjects:true}:{}),
  flammable: body.flammable,
  // The factory supplies no mana, familiar origin, regeneration, escape power or spellbook.
 };
}

export function canReanimate(s: GameState, corpseId: string, level: number, controller: string | null): boolean {
 const body = reanimationBody(s, corpseId, level);
 if (!body) return false;
 const corpse = s.corpses.find(c => c.id === corpseId)!;
 const preview = createCreature('$reanimation-preview', controller, corpse.centre, reanimatedProfile(body, corpse.skeletal));
 return placement(arenaOf(s), preview, corpse.centre).legal;
}

export function reanimate(s: GameState, corpseId: string, level: number, controller: string, id: string): Creature {
 if (!canReanimate(s, corpseId, level, controller)) throw new Error('INVALID_REANIMATION');
 const body = reanimationBody(s, corpseId, level)!;
 const corpse = s.corpses.find(c => c.id === corpseId)!;
 const servant = createCreature(id, controller, { ...corpse.centre }, {
  ...reanimatedProfile(body, corpse.skeletal), bindingLevel: level,
  fireAcidDamage: corpse.fireAcidDamage,
  readyTurn: s.turn + 1, createdSequence: s.nextEntityId,
 });
 corpse.restorationUsed = true;
 body.restorationUsed = true;
 s.creatures.push(servant);
 return servant;
}
