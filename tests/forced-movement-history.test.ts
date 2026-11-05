import { expect, it } from 'vitest';
import { createMatch } from '../packages/engine/src/index.js';
import { forceMove } from '../packages/engine/src/casting.js';
import { encodeSnapshot, restoreSnapshot } from '../packages/persistence/src/snapshot.js';
import { attackTraitModifiers } from '../packages/engine/src/attack-traits.js';

it('records forced movement once and retains it through snapshot restoration for Aim',()=>{
 const s=createMatch('forced-history',['a','b'],100);
 const c=s.creatures[0]!;c.centre={q:5,r:5};s.creatures[1]!.centre={q:20,r:15};
 forceMove(s,c,{q:6,r:5},[]);forceMove(s,c,{q:7,r:5},[]);
 expect(s.moved).toEqual([c.id]);
 const restored=restoreSnapshot(encodeSnapshot(s));
 expect(restored.moved).toEqual([c.id]);
 expect(attackTraitModifiers({aim:true,brace:false,ambush:false,closeDisadvantageBelow:0,receivesRally:false},{plannedMovement:false,movedThisTurn:restored.moved.includes(c.id),phase:'late',source:'action',distance:5,targetActedThisPhase:false,activeAdjacentRallySources:0}).skill).toBe(0);
 forceMove(restored,restored.creatures[0]!,{q:8,r:5},[]);
 forceMove(s,c,{q:8,r:5},[]);
 expect(encodeSnapshot(restored)).toBe(encodeSnapshot(s));
});
it('invalid relocation does not mutate movement history or position',()=>{
 const s=createMatch('forced-invalid',['a','b'],100),c=s.creatures[0]!;
 const before=encodeSnapshot(s);
 expect(()=>forceMove(s,c,{q:-100,r:-100},[])).toThrow('INVALID_FORCED_DESTINATION');
 expect(encodeSnapshot(s)).toBe(before);
});
it('a no-op relocation is not actual movement',()=>{
 const s=createMatch('forced-no-op',['a','b'],100),c=s.creatures[0]!;
 forceMove(s,c,{...c.centre},[]);
 expect(s.moved).toEqual([]);
});
