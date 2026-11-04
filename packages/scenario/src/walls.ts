import { createMatch,createCreature,applyCommand } from '../../engine/src/index.js';
import { createWeed } from '../../engine/src/tangleweed.js';
import { edge } from '../../geometry/src/walls.js';
import type { GameState,Order } from '../../domain/src/state.js';
/** Illusion damage, a fire crossing, weed cost and a Slow crystal wall intercepting a late shot. */
export function wallScenario():GameState {
 let s=createMatch('wall-review',['human','opponent'],10002);
 s.creatures[0]!.centre={q:5,r:5};s.creatures[0]!.move=4;s.creatures[0]!.spellbook=['Disbelief'];s.creatures[1]!.centre={q:20,r:15};
 const shot={id:'bolt',name:'Bolt',mode:'projectile' as const,range:8,minRange:0,radius:0,shots:[{skill:100,crit:0,components:[{type:'magic' as const,amount:2}],secondary:[]}]};
 s.creatures.push(createCreature('mage','human',{q:5,r:8},{dex:10,mana:40,maxMana:40,spellLevelCap:8,spellbook:['Wall']}),
 createCreature('illusion','opponent',{q:9,r:6},{kind:'illusion',creatorId:'wizard-1',knownIllusionBy:['opponent'],dex:9,attacks:[shot]}),
 createCreature('shooter','opponent',{q:12,r:5},{dex:1,attacks:[{...shot,shots:[{...shot.shots[0]!,components:[{type:'physical',amount:6}]}]}]}));
 s.walls.push({id:'fire-wall',networkId:'fire-network',casterId:'wizard-1',material:'fire',edge:edge({q:6,r:5},{q:7,r:5}),hp:23,maxHp:23,burning:null});
 createWeed(s,s.creatures[1]!,{type:'Cast',spell:'Tangleweed',level:1,variant:'bound',targetId:null,ground:{q:8,r:5},hexes:[{q:8,r:5}],side:'left'},'weed',[]);
 const orders:Order[]=[{creatureId:'wizard-0',path:[{q:6,r:5},{q:7,r:5},{q:8,r:5}],early:null,late:{type:'Cast',spell:'Disbelief',level:1,variant:'bound',targetId:'illusion',ground:null,side:'left'}},
 {creatureId:'mage',path:[],early:{type:'Cast',spell:'Wall',level:4,variant:'bound',targetId:null,ground:{q:9,r:5},edges:[edge({q:9,r:5},{q:10,r:5})],side:'left'},late:null},
 {creatureId:'illusion',path:[],early:{type:'Attack',attackId:'bolt',targetIds:['wizard-0'],ground:null,side:'left'},late:null},
 {creatureId:'shooter',path:[],early:null,late:{type:'Attack',attackId:'bolt',targetIds:['wizard-0'],ground:null,side:'left'}}];
 for(const order of orders)s=applyCommand(s,{type:'SetOrder',matchId:s.matchId,playerId:['wizard-0','mage'].includes(order.creatureId)?'human':'opponent',turn:1,commandId:`order-${order.creatureId}`,expectedRevision:s.revision,order}).state;
 s.random.resolution=1;return s;
}
