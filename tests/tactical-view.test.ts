import {it,expect} from 'vitest';
import {createMatch,createCreature} from '../packages/engine/src/index.js';
import {projectView} from '../packages/views/src/index.js';
it('hold projection includes visible owned interactions without disclosing hidden or unrelated holds',()=>{
 const s=createMatch('holds',['human','other'],123);s.creatures.push(createCreature('grappler','human',{q:10,r:5},{grappleLimbs:1}),createCreature('target','other',{q:11,r:5}),createCreature('stranger','other',{q:15,r:5},{grappleLimbs:1}),createCreature('third',null,{q:16,r:5}));s.holds=[{grapplerId:'grappler',targetId:'target',limb:0},{grapplerId:'stranger',targetId:'third',limb:0}];
 const v=projectView(s,'human');expect(v.holds).toEqual([s.holds[0]]);v.holds[0]!.targetId='edited';expect(s.holds[0]!.targetId).toBe('target');s.creatures.find(c=>c.id==='target')!.invisible=true;expect(projectView(s,'human').holds).toEqual([]);
});
