import { wallStepCost,crossWallHazards } from './walls.js';
import { weedStepCost,contactWeed,pruneWeedHolds } from './tangleweed.js';
import { regrowSwarms } from './swarms.js';
import { startCast, completeCast, invalidateCasts, concentration, castingLocksMovement, slotOccupied } from './casting.js';
import { awardAndRegenerate } from './spellbooks.js';
import { compareEntries } from './queue.js';
import { active, restrained, slowed, subdued, fearAllowsStep } from './status.js';
import { beginAttack, guardReactionAction, stepAttack, resolveCombatAction, enqueueGuards } from './combat.js';
import { ongoingDamage, cleanupDeaths, recover, expireConditions } from './lifecycle.js';
import type { Creature, GameState } from '../../domain/src/state.js';
import { nearestPair, footprint } from '../../geometry/src/hex.js';
import { legalPathPrefix, stepLegality, placement } from '../../geometry/src/occupancy.js';
import { arenaOf, defaultOrder, effectiveMove, movementAllowance } from './orders.js';
import { buildQueue } from './queue.js';
import { checkVictory, emit, type Event, type Transition } from './index.js';

const eligible = (c: Creature, turn: number) => active(c) && c.readyTurn <= turn;
export function isDefending(state: GameState, creatureId: string, phase: 'early' | 'late'): boolean {
  return state.defending.some(d => d.creatureId === creatureId && d.phases.includes(phase));
}
function initialize(state: GameState, events: Event[]): void {
  const candidates = state.creatures.filter(c => c.alive).map(c => {
    const player = state.players.find(p => p.id === c.controller);
    const wizard = state.creatures.find(w => w.id === player?.wizardId);
    return { creatureId: c.id, dex: c.dex, move: effectiveMove(c), size: c.size, slowed: slowed(c), quick: false,
      wizardDistance: wizard ? nearestPair(footprint(c.centre, c.size), footprint(wizard.centre, wizard.size)).distance : 0 };
  });
  const queue = buildQueue(candidates, state.random.resolution, state.phase === 'movement');
  state.random.resolution = queue.randomState;
  state.cursor = { entries: queue.entries, index: 0, pathIndex: 0, initialized: true, activePath: null, lastRestingCentre: null };
  emit(state, events, { type: 'PhaseStarted' });
}
function finishPhase(state: GameState, events: Event[]): void {
  state.quickQueue=null; state.actedThisPhase=[];
  emit(state, events, { type: 'PhaseEnded' });
  if (checkVictory(state, events)) return;
  state.cursor = { entries: [], index: 0, pathIndex: 0, initialized: false, activePath: null, lastRestingCentre: null };
  if (state.phase === 'early') state.phase = 'movement';
  else if (state.phase === 'movement') state.phase = 'late';
  else { state.phase = 'end'; state.endStep = 0; }
}
function finishTurn(state: GameState, events: Event[]): void {
  awardAndRegenerate(state); state.castOccupied=[]; state.quickQueue=null;
  state.wallCrossings=[];state.weedAttempts=[];state.movementSpent=[];
  state.actedThisPhase=[];state.turn++; state.phase = 'planning'; state.orders = []; state.dashed = []; state.reservations = []; state.defending = []; state.guards = []; state.spentActions = []; state.moved = [];
  state.cursor = { entries: [], index: 0, pathIndex: 0, initialized: false, activePath: null, lastRestingCentre: null };
  for (const p of state.players) { p.locked = p.eliminated; p.participated = false; }
  regrowSwarms(state,events);
  emit(state, events, { type: 'TurnStarted' });
}

export function advanceAtomicStep(state: GameState): Transition {
  if (!['early', 'movement', 'late', 'end'].includes(state.phase)) throw new Error('NOT_RESOLVING');
  const next = structuredClone(state), events: Event[] = [];
  if (next.phase === 'end') {
    switch(next.endStep) {
      case 0: ongoingDamage(next,events); concentration(next,next.creatures.map(c=>({targetId:c.id,amount:events.filter(e=>e.type==='DamageApplied'&&e.creatureId===c.id).reduce((n,e)=>n+(e.amount??0),0)})),events); break;
      case 1: cleanupDeaths(next,events); checkVictory(next,events); break;
      case 2: recover(next,events); break;
      case 3: expireConditions(next); cleanupDeaths(next,events); checkVictory(next,events); break;
      case 4: finishTurn(next,events); break;
    }
    if(next.phase === 'end') next.endStep++;
  } else if (next.pendingAttack) {
    const source = next.pendingAttack.source;
    if(stepAttack(next,events) && source === 'action') next.cursor.index++;
  } else if (next.reactions.length) {
    const reaction = next.reactions.shift()!;
    const attacker = next.creatures.find(c=>c.id===reaction.attackerId)!;
    const action=guardReactionAction(next,attacker,reaction.targetId,reaction.attackId);
    if(action)beginAttack(next,attacker,action,'guard',events);else emit(next,events,{type:'AttackInvalid',creatureId:attacker.id});
  } else if (!next.cursor.initialized) initialize(next, events);
  else if (next.cursor.index === next.cursor.entries.length) {
    if(next.phase!=='movement' && next.quickQueue===null){
      next.quickQueue=next.cursor.entries.filter(e=>next.casts.some(c=>c.casterId===e.creatureId&&c.timing==='quick'&&c.dueTurn===next.turn&&c.duePhase===next.phase)).map(e=>({...e,quick:true})).sort((a,b)=>compareEntries(a,b,false)).map(e=>e.creatureId);
    }else if(next.quickQueue?.length){
      const casterId=next.quickQueue.shift()!;const cast=next.casts.find(c=>c.casterId===casterId&&c.timing==='quick');if(cast)completeCast(next,cast.id,events);
    }else finishPhase(next, events);
  }
  else {
    const entry = next.cursor.entries[next.cursor.index]!;
    const c = next.creatures.find(c => c.id === entry.creatureId)!;
    const order = next.orders.find(o => o.creatureId === c.id) ?? defaultOrder(c.id);
    const advanceActor = () => {
      if(next.phase === 'movement' && c.alive && next.cursor.lastRestingCentre && !placement(arenaOf(next),c,c.centre).legal) {
        const from={...c.centre}; c.centre={...next.cursor.lastRestingCentre};pruneWeedHolds(next); emit(next,events,{type:'MovementInterrupted',creatureId:c.id,from,to:{...c.centre}});
      }
      next.cursor.index++; next.cursor.pathIndex = 0; next.cursor.activePath = null; next.cursor.lastRestingCentre = null; };
    if (!eligible(c, next.turn) || c.controller === null || (next.phase === 'movement' && (restrained(next,c) || castingLocksMovement(next,c) || (subdued(c) && next.spentActions.includes(c.id))))) {
      emit(next, events, { type: 'ActorSkipped', creatureId: c.id }); advanceActor();
    } else if (next.phase === 'movement') {
      if (next.cursor.activePath === null) {
        next.cursor.lastRestingCentre = {...c.centre};
        next.cursor.activePath = legalPathPrefix(arenaOf(next), c, order.path, movementAllowance(c, order.early === 'Dash' && !next.dashed.includes(c.id) ? { ...order, early: null } : order));
        emit(next, events, { type: next.cursor.activePath.length < order.path.length ? 'PathTruncated' : 'PathPrepared', creatureId: c.id });
      } else if (next.cursor.pathIndex >= next.cursor.activePath.length) advanceActor();
      else {
        const to = next.cursor.activePath[next.cursor.pathIndex]!;
        if (!fearAllowsStep(next,c,to) || (next.movementSpent.find(m=>m.creatureId===c.id)?.amount??0)+Math.max(weedStepCost(next,c,to),wallStepCost(next,c,c.centre,to))>movementAllowance(c,order) || !stepLegality(arenaOf(next), c, c.centre, to, next.cursor.pathIndex < next.cursor.activePath.length - 1).legal) {
          emit(next, events, { type: 'MovementBlocked', creatureId: c.id }); advanceActor();
        } else {
          if(!next.moved.includes(c.id)) next.moved.push(c.id);
          const paid=next.movementSpent.find(m=>m.creatureId===c.id);const cost=Math.max(weedStepCost(next,c,to),wallStepCost(next,c,c.centre,to));
          if(paid)paid.amount+=cost;else next.movementSpent.push({creatureId:c.id,amount:cost});
          const from = { ...c.centre }; c.centre = { ...to }; next.cursor.pathIndex++;
          if(placement(arenaOf(next),c,c.centre).legal) next.cursor.lastRestingCentre = {...c.centre};
          emit(next, events, { type: 'CreatureMoved', creatureId: c.id, from, to: { ...to } });
          const hazardDamage=crossWallHazards(next,c,from,to,events);cleanupDeaths(next,events);concentration(next,[{targetId:c.id,amount:hazardDamage}],events);
          contactWeed(next,c,events);if(c.alive)enqueueGuards(next,c,from);
        }
      }
    } else {
      const phase=next.phase as 'early'|'late';
      const completing=next.casts.find(cast=>cast.casterId===c.id&&cast.timing!=='quick'&&cast.dueTurn===next.turn&&cast.duePhase===phase);
      if(completing){if(!next.actedThisPhase.includes(c.id))next.actedThisPhase.push(c.id);completeCast(next,completing.id,events);advanceActor();return {state:next,events,acknowledgedRevision:next.revision};}
      if(slotOccupied(next,c,phase)){advanceActor();return {state:next,events,acknowledgedRevision:next.revision};}
      if(subdued(c) && (next.moved.includes(c.id) || next.spentActions.includes(c.id))) { advanceActor(); return {state:next,events,acknowledgedRevision:next.revision}; }
      const action = next.phase === 'early' ? order.early : order.late;
      if (action === 'Dash') next.dashed.push(c.id);
      if(action){next.spentActions.push(c.id);if(!next.actedThisPhase.includes(c.id))next.actedThisPhase.push(c.id);}
      if(action&&typeof action==='object'&&action.type==='Cast') startCast(next,c,action,events);
      else resolveCombatAction(next,c,action,events);
      if (action) emit(next, events, { type: 'ActionResolved', creatureId: c.id, action: typeof action === 'string' ? action : action.type });
      if(!next.pendingAttack) advanceActor();
    }
  }
  invalidateCasts(next,events);
  return { state: next, events, acknowledgedRevision: next.revision };
}
