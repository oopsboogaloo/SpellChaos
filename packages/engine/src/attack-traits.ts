/** Explicit attack context keeps previews and execution independent of animation
 * and clocks. The caller supplies only authoritative, serialisable facts.
 */
export interface AttackTraitContext {
 plannedMovement: boolean;
 movedThisTurn: boolean;
 phase: 'early' | 'late' | 'movement';
 source: 'action' | 'guard';
 distance: number;
 targetActedThisPhase: boolean;
 activeAdjacentRallySources: number;
}
export interface AttackTraits {
 aim: boolean;
 brace: boolean;
 ambush: boolean;
 closeDisadvantageBelow: number;
 receivesRally: boolean;
}
/** Bonuses do not roll dice or alter the critical roll. Rally sources must
 * already exclude the attacker and inactive/non-allied/non-adjacent creatures.
 */
export function attackTraitModifiers(traits: AttackTraits, context: AttackTraitContext) {
 const aim = traits.aim && !context.movedThisTurn &&
  (context.phase !== 'early' || !context.plannedMovement);
 return {
  skill: (aim ? 2 : 0) + (traits.receivesRally && context.activeAdjacentRallySources > 0 ? 1 : 0),
  damage: traits.brace && context.source === 'guard' ? 2 : 0,
  advantage: traits.ambush && !context.targetActedThisPhase,
  disadvantage: traits.closeDisadvantageBelow > 0 && context.distance < traits.closeDisadvantageBelow,
 };
}
