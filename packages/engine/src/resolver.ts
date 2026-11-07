import {riderOf,carryingLocked,carryingFearAllows,moveRider} from './mounts.js';
import {bodyFootprint} from './bodies.js';
import {flightHeight,flightStepLegal} from './flight.js';
import {revealBlockedContact,expireReveals} from './detection.js';
import {canDrag,dragStepLegal,dragTarget,dragDestination} from './drag.js';
import {pruneRootNetworks} from './ground-traits.js';
import {blinkLegal,movementStepCost,prepareMovementPath} from './blink.js';
import {stepPower} from './powers.js';
import { crossWallHazards } from './walls.js';
import { contactWeed,pruneWeedHolds } from './tangleweed.js';
import { regrowSwarms } from './swarms.js';
import { startCast, completeCast, invalidateCasts, forceMove, concentration, castingLocksMovement, slotOccupied } from './casting.js';
import { awardAndRegenerate } from './spellbooks.js';
import { compareEntries } from './queue.js';
import { active, restrained, slowed, subdued, fearAllowsStep } from './status.js';
import { beginAttack, guardReactionAction, stepAttack, resolveCombatAction, enqueueGuards } from './combat.js';
import { ongoingDamage, cleanupDeaths, recover, expireConditions, expirePhaseConditions } from './lifecycle.js';
import type { Creature, GameState } from '../../domain/src/state.js';
import { nearestPair, footprint } from '../../geometry/src/hex.js';
import { stepLegality, placement } from '../../geometry/src/occupancy.js';
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
      wizardDistance: wizard ? nearestPair(bodyFootprint(state,c), bodyFootprint(state,wizard)).distance : 0 };
  });
  const queue = buildQueue(candidates, state.random.resolution, state.phase === 'movement');
  state.random.resolution = queue.randomState;
  state.cursor = { entries: queue.entries, index: 0, pathIndex: 0, initialized: true, activePath: null, lastRestingCentre: null };
  emit(state, events, { type: 'PhaseStarted' });
}
function finishPhase(state: GameState, events: Event[]): void {
  if(state.phase==='early'||state.phase==='late')expirePhaseConditions(state);
  expireReveals(state);
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
  for (const c of state.creatures){delete c.pounceTrail;delete c.diveTrail;}
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
  } else if(next.pendingPower){
    if(stepPower(next,events))next.cursor.index++;
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
    const allowance=movementAllowance(c,order.early==='Dash'&&!next.dashed.includes(c.id)?{...order,early:null}:order);
    const revealContact=(to:Creature['centre'])=>{if(fearAllowsStep(next,c,to)&&(next.movementSpent.find(m=>m.creatureId===c.id)?.amount??0)+movementStepCost(next,c,order,next.cursor.pathIndex,c.centre,to)<=allowance)revealBlockedContact(next,c,to,flightHeight(c,order,next.cursor.pathIndex),events);};
    const advanceActor = () => {
      if(next.phase === 'movement' && c.alive && next.cursor.lastRestingCentre && !placement(arenaOf(next),c,c.centre).legal) {
        delete c.pounceTrail;delete c.diveTrail; const from={...c.centre}; c.centre={...next.cursor.lastRestingCentre};if(next.cursor.lastRestingHeight)c.height=next.cursor.lastRestingHeight;moveRider(next,c,events);pruneWeedHolds(next);pruneRootNetworks(next); emit(next,events,{type:'MovementInterrupted',creatureId:c.id,from,to:{...c.centre}});
      }
      next.cursor.index++; next.cursor.pathIndex = 0; next.cursor.activePath = null; next.cursor.lastRestingCentre = null;delete next.cursor.lastRestingHeight; };
    if (!eligible(c, next.turn) || c.controller === null || (next.phase === 'movement' && (c.mountId!==undefined||carryingLocked(next,c)|| (order.dragTargetId!==undefined?!canDrag(next,c,order):restrained(next,c)) || castingLocksMovement(next,c) || (subdued(c) && next.spentActions.includes(c.id))))) {
      emit(next, events, { type: 'ActorSkipped', creatureId: c.id }); advanceActor();
    } else if (next.phase === 'movement') {
      if (next.cursor.activePath === null) {
        next.cursor.lastRestingCentre = {...c.centre};if(order.flightSteps)next.cursor.lastRestingHeight=c.height;
        next.cursor.activePath = prepareMovementPath(next,c,order,allowance);
        emit(next, events, { type: next.cursor.activePath.length < order.path.length ? 'PathTruncated' : 'PathPrepared', creatureId: c.id });
      } else if (next.cursor.pathIndex >= next.cursor.activePath.length) {if(next.cursor.pathIndex<order.path.length)revealContact(order.path[next.cursor.pathIndex]!);advanceActor();}
      else {
        const to = next.cursor.activePath[next.cursor.pathIndex]!;
        const blinking=order.blinkIndex===next.cursor.pathIndex;
        const dragging=order.dragTargetId!==undefined;
        const stepCost=movementStepCost(next,c,order,next.cursor.pathIndex,c.centre,to);
        if (!fearAllowsStep(next,c,to)||!carryingFearAllows(next,c,to)||carryingLocked(next,c) || (next.movementSpent.find(m=>m.creatureId===c.id)?.amount??0)+stepCost>movementAllowance(c,order) || !(order.flightSteps?flightStepLegal(next,c,order,next.cursor.pathIndex,c.centre,to,next.cursor.pathIndex<next.cursor.activePath.length-1):dragging?dragStepLegal(next,c,order,c.centre,to):blinking?blinkLegal(next,c,c.centre,to):stepLegality(arenaOf(next), c, c.centre, to, next.cursor.pathIndex < next.cursor.activePath.length - 1).legal)) {
          revealContact(to);
          emit(next, events, { type: 'MovementBlocked', creatureId: c.id }); advanceActor();
        } else {
          if(!next.moved.includes(c.id)) next.moved.push(c.id);
          const paid=next.movementSpent.find(m=>m.creatureId===c.id);const cost=stepCost;
          if(paid)paid.amount+=cost;else next.movementSpent.push({creatureId:c.id,amount:cost});
          const from = { ...c.centre },fromHeight=c.height;
          const victim=dragging?dragTarget(next,c,order):undefined;
          const victimTo=victim?dragDestination(next,c,order,to):undefined;
          if(blinking){c.blinkUsedTurn=next.turn;delete c.pounceTrail;}
          else if(order.flightSteps?.some(x=>x.index===next.cursor.pathIndex))delete c.pounceTrail;
          else if(c.pounce)c.pounceTrail=[...(c.pounceTrail??[from]),{...to}];
          const newHeight=flightHeight(c,order,next.cursor.pathIndex);
          if(c.dive){if(!blinking&&fromHeight==='air'&&newHeight==='air'&&(from.q!==to.q||from.r!==to.r))c.diveTrail=[...(c.diveTrail??[from]),{...to}];else if(blinking||fromHeight==='ground'||newHeight==='ground'&&(from.q!==to.q||from.r!==to.r))delete c.diveTrail;}
          c.height=newHeight;
          c.centre = { ...to }; next.cursor.pathIndex++;
          const carried=moveRider(next,c,events);
          if(placement(arenaOf(next),c,c.centre).legal){next.cursor.lastRestingCentre = {...c.centre};if(order.flightSteps)next.cursor.lastRestingHeight=c.height;}
          emit(next, events, { type: blinking?'CreatureBlinked':fromHeight!==c.height?'FlightChanged':'CreatureMoved', creatureId: c.id, from, to: { ...to } });
          if(victim&&victimTo){forceMove(next,victim,victimTo,events);if(placement(arenaOf(next),c,c.centre).legal)next.cursor.lastRestingCentre={...c.centre};}
          const hazardDamage=blinking?0:crossWallHazards(next,c,from,to,events);const riderDamage=carried&&!blinking?crossWallHazards(next,carried,from,to,events):0;cleanupDeaths(next,events);concentration(next,[{targetId:c.id,amount:hazardDamage},...(carried?[{targetId:carried.id,amount:riderDamage}]:[])],events);
          contactWeed(next,c,events);if(carried)contactWeed(next,carried,events);if(c.alive&&!blinking){enqueueGuards(next,c,from,fromHeight);if(carried?.alive&&carried.mountId===c.id)enqueueGuards(next,carried,from,fromHeight);}
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
      if(!next.pendingAttack&&!next.pendingPower) advanceActor();
    }
  }
  pruneRootNetworks(next);invalidateCasts(next,events);
  return { state: next, events, acknowledgedRevision: next.revision };
}
