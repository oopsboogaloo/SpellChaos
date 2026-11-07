import { consumeDamageLoss } from './illusions.js';
import { resizeSwarm } from './swarms.js';
import type { Creature,GameState } from '../../domain/src/state.js';
import type { DamageComponent,DamageType,Condition } from '../../domain/src/combat.js';
import { emit,type Event } from './events.js';
import { randomBelow } from '../../domain/src/random.js';
export const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
export const hitChance=(skill:number,dex:number)=>clamp(70+5*(skill-dex),10,95);
export const effectChance=(potency:number,resistance:number)=>clamp(50+5*(potency-resistance),10,90);
export const escapeChance=(escapeeSize:number,grapplerSize:number)=>clamp(50+10*(escapeeSize-grapplerSize),10,90);
export function roll(s:GameState,chance:number,advantage=false,disadvantage=false):boolean {
 const first=randomBelow(s.random.resolution,100);s.random.resolution=first.state;let result=first.value;
 if(advantage!==disadvantage){const second=randomBelow(s.random.resolution,100);s.random.resolution=second.state;result=advantage?Math.min(result,second.value):Math.max(result,second.value);}
 return result<chance;
}
export function damageMultiplier(c:Creature,type:DamageType,area=false):number {
 if(type==='poison' && (c.undead||c.construct||c.plant))return 0;
 const modifiers=c.defences.filter(d=>d.type===type).map(d=>d.multiplier);
 if(modifiers.includes(0) || (type==='physical' && (c.incorporeal || c.undeadClass==='higher')))return 0;
 let resistance=Math.min(1,...modifiers.filter(x=>x<1)),vulnerability=Math.max(1,...modifiers.filter(x=>x>1));
 if(type==='physical' && c.undeadClass==='zombie')resistance=Math.min(resistance,0.5);
 if(type==='physical' && c.undeadClass==='skeleton')resistance=Math.min(resistance,0.25);
 if(c.swarm){
  if(type==='physical')resistance=area?1:Math.min(resistance,0.5);
  if(type==='fire'||area)vulnerability=Math.max(vulnerability,1.5);
 }
 return resistance*vulnerability;
}
export function applyDamage(s:GameState,c:Creature,components:readonly DamageComponent[],events:Event[],options:{area?:boolean;critical?:boolean;half?:boolean;raw?:boolean;sourceId?:string|null;actionId?:string|null}={}):number {
 if(components.some(c=>!Number.isSafeInteger(c.amount)||c.amount<0))throw new Error('INVALID_DAMAGE');
 const source=options.sourceId?s.creatures.find(x=>x.id===options.sourceId):undefined;
 if(options.sourceId&&!source)throw new Error('UNKNOWN_DAMAGE_SOURCE');
 const illusionId=source?.kind==='illusion'?source.id:null;
 if(!c.alive||(illusionId!==null&&c.intelligence===0))return 0;
 let total=0;
 for(const component of components){
  const amount=Math.ceil(component.amount*(options.critical?2:1)*(options.half?0.5:1)*(options.raw?1:damageMultiplier(c,component.type,options.area)));
  total+=amount;
  if(amount>0 && (component.type==='fire'||component.type==='acid')){if(illusionId===null)c.fireAcidDamage+=amount;c.regenerationBlockedTurn=s.turn;}
 }
 if(total===0)return 0;
 s.damageLedger.push({sequence:s.nextEntityId++,targetId:c.id,sourceId:options.sourceId??null,actionId:options.actionId??null,illusionId,components:structuredClone([...components]),amount:total,remaining:total});
 c.hp=Math.max(-1000000,c.hp-total);c.conditions=c.conditions.filter(e=>e.kind!=='Unconscious');
 resizeSwarm(s,c,events,false);
 emit(s,events,{type:'DamageApplied',creatureId:c.id,amount:total,critical:!!options.critical});
 return total;
}
export function immuneTo(c:Creature,kind:Condition['kind']):boolean {
 if((c.undead||c.construct)&&['Poisoned','Disease','Bleeding'].includes(kind))return true;
 if(c.plant&&['Poisoned','Disease'].includes(kind))return true;
 if((c.intelligence===0||c.construct)&&['Fear','Unconscious'].includes(kind))return true;
 return false;
}
export function addCondition(s:GameState,c:Creature,kind:Condition['kind'],sourceId:string|null,potency:number,duration:number|null,resistance:Condition['resistance']='int',requiresDamage=true):boolean {
 const illusionId=s.creatures.find(x=>x.id===sourceId)?.kind==='illusion'?sourceId:null;
 if(!c.alive||immuneTo(c,kind)||(illusionId!==null&&c.intelligence===0))return false;
 const startsTurn=s.turn+(['Burning','Acid'].includes(kind)?1:0);
 const turns=kind==='Poisoned'?3:kind==='Burning'||kind==='Acid'?2:duration;
 const existing=c.conditions.find(e=>e.kind===kind&&e.illusionId===illusionId);
 const condition:Condition={kind,illusionId,sourceId,potency,duration:turns,resistance,requiresDamage,startsTurn,
  endsTurn:turns===null?null:startsTurn+turns-1,activatesTurn:kind==='Disease'?s.turn+2:null,active:kind!=='Disease'};
 if(kind==='Burning'&&existing&&existing.endsTurn!==null&&existing.endsTurn>=s.turn)condition.startsTurn=Math.min(existing.startsTurn,startsTurn);
 if(kind==='Disease' && existing){condition.activatesTurn=existing.activatesTurn;condition.active=existing.active;}
 c.conditions=c.conditions.filter(e=>e.kind!==kind||e.illusionId!==illusionId);c.conditions.push(condition);return true;
}
export function heal(s:GameState,c:Creature,amount:number,events:Event[],mode:'ordinary'|'necromantic'|'regeneration'='ordinary',sourceId:string|null=null):number {
 if(!Number.isInteger(amount)||amount<0)throw new Error('INVALID_HEALING');
 if(sourceId!==c.id&&s.creatures.some(source=>source.id===sourceId&&source.kind==='illusion'))return 0;
 if(!c.alive || (c.swarm&&c.hp<=0) || (mode==='ordinary' && (c.undead||c.kind==='illusion')))return 0;
 const restored=Math.min(amount,c.maxHp-c.hp);consumeDamageLoss(s,c.id,restored);c.hp+=restored;
 if(mode!=='regeneration')c.conditions=c.conditions.filter(e=>e.kind!=='Bleeding');
 resizeSwarm(s,c,events,true);
 if(restored)emit(s,events,{type:'Healed',creatureId:c.id,amount:restored});return restored;
}
export function damageCorpse(s:GameState,corpseId:string,components:readonly DamageComponent[],sourceId:string|null=null):void {
 if(components.some(c=>!Number.isSafeInteger(c.amount)||c.amount<0))throw new Error('INVALID_DAMAGE');
 if(s.creatures.some(c=>c.id===sourceId&&c.kind==='illusion'))return;
 const corpse=s.corpses.find(c=>c.id===corpseId);if(!corpse)throw new Error('UNKNOWN_CORPSE');
 corpse.fireAcidDamage+=components.filter(c=>c.type==='fire'||c.type==='acid').reduce((sum,c)=>sum+c.amount,0);
 corpse.skeletal=corpse.fireAcidDamage>=corpse.maxHp/2;
}
export function damageWall(s:GameState,wallId:string,components:readonly DamageComponent[],events:Event[],sourceId:string|null=null):number {
 if(components.some(c=>!Number.isSafeInteger(c.amount)||c.amount<0))throw new Error('INVALID_DAMAGE');
 if(sourceId&&!s.creatures.some(c=>c.id===sourceId))throw new Error('UNKNOWN_DAMAGE_SOURCE');
 if(s.creatures.some(c=>c.id===sourceId&&c.kind==='illusion'))return 0;
 const wall=s.walls.find(w=>w.id===wallId);if(!wall)return 0;
 const amount=components.reduce((sum,c)=>sum+(wall.material==='iron' && c.type==='fire'?0:c.amount),0);
 wall.hp=Math.max(0,wall.hp-amount);if(wall.hp===0){s.walls=s.walls.filter(w=>w.id!==wallId);if(!s.destroyedWallIds.includes(wallId))s.destroyedWallIds.push(wallId);}
 emit(s,events,{type:'WallDamaged',targetId:wallId,amount});return amount;
}
