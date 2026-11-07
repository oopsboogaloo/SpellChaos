import type {Creature,GameState,Order} from '../../domain/src/state.js';
import type {AttackDefinition} from '../../domain/src/combat.js';
import {nearestPair} from '../../geometry/src/hex.js';
import {clearProjectile} from '../../geometry/src/walls.js';
import {bodyFootprint,bodySize} from './bodies.js';
import {active,afterEarlyWake,restrained,subdued} from './status.js';
import {perceives,sight} from './visibility.js';
import {randomBelow} from './random.js';
import {defaultOrder,effectiveMove} from './orders.js';
import {routeTowards} from './navigation.js';
const pair=(s:GameState,a:Creature,b:Creature)=>nearestPair(bodyFootprint(s,a),bodyFootprint(s,b));
function reaches(s:GameState,c:Creature,t:Creature,a:AttackDefinition):boolean {
 const p=pair(s,c,t),melee=['melee','swarm','cleave'].includes(a.mode);
 return p.distance>=a.minRange&&p.distance<=a.range&&(!melee||c.height===t.height)&&(sight(s,c,p.from,p.to,'left')||(p.distance<=1&&clearProjectile(p.from,p.to,'left',s.walls)))&&(!melee||clearProjectile(p.from,p.to,'left',s.walls));
}
function strike(s:GameState,c:Creature,t:Creature):Order['early'] {
 const a=c.attacks.find(a=>reaches(s,c,t,a));if(!a)return null;
 return {type:'Attack',attackId:a.id,targetIds:['swarm','cleave','area'].includes(a.mode)?[]:[t.id],ground:a.mode==='area'?pair(s,c,t).to:null,side:'left'};
}
export function prepareUnboundOrders(s:GameState):void {
 s.autonomous=[];
 for(const c of [...s.creatures].filter(c=>c.controller===null&&c.kind!=='wizard'&&active(afterEarlyWake(c,s.turn))&&c.readyTurn<=s.turn).sort((a,b)=>a.id<b.id?-1:1)){
  const earlyReady=active(c);
  const perceived=s.creatures.filter(t=>t.id===c.id||perceives(s,c,t));
  const targets=perceived.filter(t=>t.id!==c.id&&(c.family&&t.family?c.family!==t.family||c.summonLevel!==t.summonLevel:t.species!==c.species)).sort((a,b)=>pair(s,c,a).distance-pair(s,c,b).distance||(a.id<b.id?-1:1));
  let order=defaultOrder(c.id);s.autonomous.push(c.id);
  if(targets.length){
   const nearest=pair(s,c,targets[0]!).distance,ties=targets.filter(t=>pair(s,c,t).distance===nearest);
   const draw=ties.length>1?randomBelow(s.random.ai,ties.length):{state:s.random.ai,value:0};s.random.ai=draw.state;const target=ties[draw.value]!;
   // Apparent bodies only: no illusion truth, hidden occupants or shared vision.
   const knowledge={...s,creatures:perceived.map(t=>{const body={...t,centre:{...t.centre},size:bodySize(s,t),kind:t.id===c.id?t.kind:'summon' as const};delete body.mountId;return body;})};
   const actor=knowledge.creatures.find(t=>t.id===c.id)!,victim=knowledge.creatures.find(t=>t.id===target.id)!;
   if(restrained(s,c))order={creatureId:c.id,path:[],early:earlyReady?'Escape':null,late:earlyReady?null:'Escape'};
   else if(c.reload&&!c.reload.loaded&&c.reload.lastFiredTurn!==s.turn)order={creatureId:c.id,path:[],early:earlyReady?{type:'Reload'}:null,late:earlyReady?null:{type:'Reload'}};
   else{
    const early=strike(knowledge,actor,victim);
    if(early)order={creatureId:c.id,path:[],early:earlyReady?early:null,late:!earlyReady||c.doubleAction&&!subdued(c)?structuredClone(early):null};
    else if(!c.conditions.some(e=>e.kind==='Fear'&&e.active&&!perceived.some(t=>t.id===e.sourceId))){
     const range=Math.max(1,...c.attacks.map(a=>a.range)),route=routeTowards(knowledge,actor,effectiveMove(c)+(c.kind==='illusion'?2:0),body=>Math.max(0,pair(knowledge,body,victim).distance-range),body=>c.attacks.some(a=>reaches(knowledge,body,victim,a)),192);
     if(route.path.length){const late=subdued(c)?null:strike(knowledge,{...actor,centre:route.centre,height:route.height},victim);order={creatureId:c.id,path:route.path,early:null,late,...(route.flightSteps?{flightSteps:route.flightSteps}:{})};}
    }
   }
  }
  s.orders=s.orders.filter(o=>o.creatureId!==c.id);s.orders.push(order);
 }
}
