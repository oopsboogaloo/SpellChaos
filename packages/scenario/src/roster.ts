import {approvedRoster} from '../../content/src/roster.js';
import {createMatch,createCreature,applyCommand} from '../../engine/src/index.js';
import {arenaOf} from '../../engine/src/orders.js';
import {bodyFootprint} from '../../engine/src/bodies.js';
import {placement} from '../../geometry/src/occupancy.js';
import {fromOffset,nearestPair} from '../../geometry/src/hex.js';
import type {Creature,GameState,Order} from '../../domain/src/state.js';

/** Scripted integration turn, not an AI policy or balance simulation. Every MVP
 * profile has legal initial occupancy; actions exercise the production engine. */
export function fullRosterScenario():GameState {
 let s=createMatch('full-roster-v26',['a','b'],713);
 s.creatures[0]!.centre=fromOffset({column:0,row:0});s.creatures[1]!.centre=fromOffset({column:29,row:29});
 const rows=approvedRoster().filter(r=>!['Goblin','Dragon'].includes(r.profile.family!)).sort((a,b)=>b.profile.size!-a.profile.size!||(a.profile.species!<b.profile.species!?-1:1));
 for(const [i,row] of rows.entries()){
  const body=createCreature(`roster-${row.profile.family}-${row.profile.summonLevel}`,i%2?'b':'a',{q:0,r:0},{...row.profile,bindingLevel:row.profile.summonLevel!});
  let found=false;
  for(let y=0;y<30&&!found;y++)for(let x=0;x<30;x++){
   const centre=fromOffset({column:x,row:y});
   if(placement(arenaOf(s),body,centre).legal){body.centre=centre;found=true;break;}
  }
  if(!found)throw new Error('ROSTER_PLACEMENT_FAILED');
  if(body.regeneration||body.lifeDrain)body.hp-=2;
  s.creatures.push(body);
 }
 const gryphon=s.creatures.find(c=>c.species==='Gryphon')!,shepherd=s.creatures.find(c=>c.species==='Shepherd')!;
 gryphon.height='ground';shepherd.controller=gryphon.controller;shepherd.centre={...gryphon.centre};shepherd.height='ground';shepherd.mountId=gryphon.id;
 const range=(a:Creature,b:Creature)=>nearestPair(bodyFootprint(s,a),bodyFootprint(s,b)).distance;
 for(const c of s.creatures.filter(c=>c.kind!=='wizard')){
  const enemies=s.creatures.filter(t=>t.id!==c.id&&t.kind!=='wizard'&&t.controller!==c.controller).sort((a,b)=>range(c,a)-range(c,b)||(a.id<b.id?-1:1));
  let action:Order['early']=null;
  if(c.wail)action={type:'Wail'};
  else if(c.rootNetwork)action={type:'RootNetwork'};
  else if(c.fearAction?.kind==='Roar')action={type:'Roar'};
  else if(c.fearAction?.kind==='Frighten'&&enemies[0])action={type:'Frighten',targetId:enemies[0].id};
  else if(c.gaze&&enemies[0])action={type:'Gaze',targetId:enemies[0].id};
  else if(c.spores){const t=enemies.find(t=>!t.undead&&!t.construct&&range(c,t)<=1);if(t)action={type:'Spores',targetId:t.id};}
  if(!action){
   for(const attack of c.attacks){
    const candidates=enemies.filter(t=>range(c,t)>=attack.minRange&&range(c,t)<=attack.range&&(!['melee','swarm','cleave'].includes(attack.mode)||c.height===t.height));
    if(attack.mode==='swarm'||attack.mode==='cleave')action={type:'Attack',attackId:attack.id,targetIds:[],ground:null,side:'left'};
    else if(candidates[0])action={type:'Attack',attackId:attack.id,targetIds:attack.mode==='area'?[]:[candidates[0].id],ground:attack.mode==='area'?nearestPair(bodyFootprint(s,c),bodyFootprint(s,candidates[0])).to:null,side:'left'};
    if(action)break;
   }
  }
  s=applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:c.controller!,turn:s.turn,commandId:`roster-${s.revision}`,expectedRevision:s.revision,order:{creatureId:c.id,path:[],early:action,late:null}}).state;
 }
 return s;
}
