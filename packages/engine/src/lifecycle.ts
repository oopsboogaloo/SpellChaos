import { invalidateCasts } from './casting.js';
import type { GameState } from '../../domain/src/state.js';
import { emit,type Event } from './events.js';
import { active } from './status.js';
import { applyDamage,heal,roll,effectChance,damageWall } from './damage.js';

export function releaseBrokenHolds(s:GameState):void {
 s.holds=s.holds.filter(h=>{const g=s.creatures.find(c=>c.id===h.grapplerId),t=s.creatures.find(c=>c.id===h.targetId);return !!g&&!!t&&active(g)&&t.alive;});
}
export function cleanupDeaths(s:GameState,events:Event[]):void {
 for(;;){
  const dying=s.creatures.filter(c=>!s.deadHandled.includes(c.id)&&(!c.alive||c.hp<=(c.swarm?0:-c.maxHp))).sort((a,b)=>a.id<b.id?-1:1);
  if(!dying.length)break;
  for(const c of dying){
   c.alive=false;s.deadHandled.push(c.id);
   if(c.corpseEligible && !c.swarm && !c.construct && !c.plant && c.kind!=='illusion')s.corpses.push({id:`corpse:${c.id}`,creatureId:c.id,centre:{...c.centre},size:c.size,con:c.con,maxHp:c.maxHp,fireAcidDamage:c.fireAcidDamage,skeletal:c.fireAcidDamage>=c.maxHp/2,restorationUsed:false});
   s.guards=s.guards.filter(g=>g.creatureId!==c.id);
   s.reservations=s.reservations.filter(r=>r.creatureId!==c.id);
   emit(s,events,{type:'CreatureDied',creatureId:c.id});
   if(c.kind==='wizard'){
    const p=s.players.find(p=>p.wizardId===c.id)!;p.eliminated=true;p.locked=true;
    for(const servant of s.creatures.filter(x=>x.id!==c.id && x.controller===p.id)){
     if(servant.kind==='summon'){servant.controller=null;servant.bindingLevel=null;s.guards=s.guards.filter(g=>g.creatureId!==servant.id);s.reactions=s.reactions.filter(r=>r.attackerId!==servant.id);}
     else {servant.hp=-servant.maxHp;servant.alive=false;}
     s.reservations=s.reservations.filter(r=>r.creatureId!==servant.id);
    }
   }
  }
 }
 releaseBrokenHolds(s);invalidateCasts(s,events);
}
export function ongoingDamage(s:GameState,events:Event[]):void {
 const snapshot=structuredClone(s.creatures.filter(c=>c.alive));
 for(const original of snapshot){
  const c=s.creatures.find(c=>c.id===original.id)!;
  for(const effect of original.conditions){
   if(s.turn<effect.startsTurn || (effect.endsTurn!==null && s.turn>effect.endsTurn))continue;
   if(effect.kind==='Bleeding')applyDamage(s,c,[{type:'physical',amount:1}],events,{raw:true});
   if(effect.kind==='Poisoned')applyDamage(s,c,[{type:'poison',amount:1}],events);
   if(effect.kind==='Acid')applyDamage(s,c,[{type:'acid',amount:1}],events);
   if(effect.kind==='Burning')applyDamage(s,c,[{type:'fire',amount:2}],events);
  }
 }
 for(const wall of structuredClone(s.walls))if(wall.burning&&s.turn>=wall.burning.startsTurn&&s.turn<=wall.burning.endsTurn)damageWall(s,wall.id,[{type:'fire',amount:2}],events);
 // Death cleanup is the next atomic end-step, after all snapshot damage has applied.
}
export function recover(s:GameState,events:Event[]):void {
 const snapshot=structuredClone(s.creatures.filter(c=>c.alive));
 for(const original of snapshot){
  const c=s.creatures.find(c=>c.id===original.id)!;
  if(original.regeneration && original.regenerationBlockedTurn!==s.turn)heal(s,c,original.regeneration,events,'regeneration');
  for(const effect of original.conditions){
   if(effect.kind==='Fear' && !roll(s,effectChance(effect.potency,c.intelligence)))c.conditions=c.conditions.filter(e=>e.kind!=='Fear');
   if(effect.kind==='Disease' && effect.activatesTurn!==null && effect.activatesTurn<=s.turn){const disease=c.conditions.find(e=>e.kind==='Disease');if(disease)disease.active=true;}
  }
 }
}
export function expireConditions(s:GameState):void {
 for(const c of s.creatures)c.conditions=c.conditions.filter(e=>e.endsTurn===null||e.endsTurn>s.turn);
 for(const wall of s.walls)if(wall.burning && wall.burning.endsTurn<=s.turn)wall.burning=null;
 releaseBrokenHolds(s);
}
