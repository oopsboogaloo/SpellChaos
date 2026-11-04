import { expect, it } from 'vitest';
import { attackTraitModifiers, type AttackTraits, type AttackTraitContext } from '../packages/engine/src/attack-traits.js';
const traits:AttackTraits={aim:false,brace:false,ambush:false,closeDisadvantageBelow:0,receivesRally:false};
const context:AttackTraitContext={plannedMovement:false,movedThisTurn:false,phase:'early',source:'action',distance:3,targetActedThisPhase:false,activeAdjacentRallySources:0};
it('D18: early Aim requires both no planned movement and no actual movement',()=>{
 for(const plannedMovement of [false,true])for(const movedThisTurn of [false,true])
  expect(attackTraitModifiers({...traits,aim:true},{...context,plannedMovement,movedThisTurn}).skill).toBe(!plannedMovement&&!movedThisTurn?2:0);
});
it('late Aim uses actual movement, including forced movement, rather than an uncompleted path',()=>{
 expect(attackTraitModifiers({...traits,aim:true},{...context,phase:'late',plannedMovement:true}).skill).toBe(2);
 expect(attackTraitModifiers({...traits,aim:true},{...context,phase:'late',movedThisTurn:true}).skill).toBe(0);
});
it('Brace changes only Guard damage',()=>{
 expect(attackTraitModifiers({...traits,brace:true},context).damage).toBe(0);
 expect(attackTraitModifiers({...traits,brace:true},{...context,source:'guard'}).damage).toBe(2);
});
it('D08: multiple eligible Rally sources grant only one Skill point',()=>{
 for(const sources of [0,1,2,8])expect(attackTraitModifiers({...traits,receivesRally:true},{...context,activeAdjacentRallySources:sources}).skill).toBe(sources?1:0);
 expect(attackTraitModifiers(traits,{...context,activeAdjacentRallySources:8}).skill).toBe(0);
});
it('Ambush depends on acting in this phase, not on turn-wide action history',()=>{
 expect(attackTraitModifiers({...traits,ambush:true},context).advantage).toBe(true);
 expect(attackTraitModifiers({...traits,ambush:true},{...context,targetActedThisPhase:true}).advantage).toBe(false);
});
it('close shots remain legal and gain disadvantage strictly below range three',()=>{
 for(const distance of [1,2,3,4])expect(attackTraitModifiers({...traits,closeDisadvantageBelow:3},{...context,distance}).disadvantage).toBe(distance<3);
});
it('portable context reproduces modifiers without mutation or hidden dependencies',()=>{
 const input={traits:{...traits,aim:true,ambush:true,receivesRally:true,closeDisadvantageBelow:3},context:{...context,distance:2,activeAdjacentRallySources:3}};
 const before=JSON.stringify(input),restored=JSON.parse(before);
 expect(attackTraitModifiers(restored.traits,restored.context)).toEqual({skill:3,damage:0,advantage:true,disadvantage:true});
 expect(JSON.stringify(input)).toBe(before);
});
