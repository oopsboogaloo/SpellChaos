import { createMatch,createCreature,applyCommand } from '../../engine/src/index.js';
import { createWeed } from '../../engine/src/tangleweed.js';
import type { GameState,Order } from '../../domain/src/state.js';
/** Seeded terrain movement, a Slow patch and a late projectile destroying one hex. */
export function tangleweedScenario():GameState {
 let s=createMatch('tangleweed-review',['human','opponent'],9002);
 s.creatures[0]!.centre={q:5,r:5};s.creatures[0]!.move=4;s.creatures[1]!.centre={q:20,r:15};
 s.creatures.push(createCreature('mage','human',{q:5,r:8},{dex:10,mana:40,maxMana:40,spellLevelCap:8,spellbook:['Tangleweed']}),
 createCreature('shooter','opponent',{q:12,r:5},{dex:1,attacks:[{id:'bow',name:'Bow',mode:'projectile',range:8,minRange:0,radius:0,shots:[{skill:5,crit:5,components:[{type:'physical',amount:6}],secondary:[]}]}]}));
 createWeed(s,s.creatures[0]!,{type:'Cast',spell:'Tangleweed',level:1,variant:'bound',targetId:null,ground:{q:7,r:5},hexes:[{q:7,r:5}],side:'left'},'existing-weed',[]);
 const orders:Order[]=[{creatureId:'wizard-0',path:[{q:6,r:5},{q:7,r:5}],early:null,late:null},
 {creatureId:'mage',path:[],early:{type:'Cast',spell:'Tangleweed',level:2,variant:'bound',targetId:null,ground:{q:9,r:5},hexes:[{q:9,r:5},{q:10,r:5}],side:'left'},late:null},
 {creatureId:'shooter',path:[],early:null,late:{type:'Attack',attackId:'bow',targetIds:[],ground:{q:9,r:5},side:'left'}}];
 for(const order of orders)s=applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:order.creatureId==='shooter'?'opponent':'human',turn:1,commandId:`order-${order.creatureId}`,expectedRevision:s.revision,order}).state;
 s.random.resolution=1;return s;
}
