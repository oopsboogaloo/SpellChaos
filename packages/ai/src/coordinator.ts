import type { GameState, Order, Command } from '../../domain/src/state.js';
import { projectView } from '../../views/src/index.js';
import { applyCommand, applySystemCommand } from '../../engine/src/index.js';
import { planWizardTurn, MAX_POLICY_WORK, type Difficulty } from './policy.js';

export interface Submission {
  state: GameState;
  work: number;
  candidates: number;
  expanded: number;
  fallbacks: number;
  truncated: boolean;
}
/** A synchronous coordinator transaction. Every decision uses the same pre-draft
 * world. Rejections never select another candidate or enter a policy feedback loop. */
export function submitAiTurn(
  state: GameState,
  playerIds: readonly string[],
  difficulty: Difficulty = 'standard',
  maxWork = 100000,
): Submission {
  if (state.phase !== 'planning') throw new Error('AI_PLANNING_ONLY');
  if (new Set(playerIds).size !== playerIds.length || playerIds.some(id => !state.players.some(p => p.id === id)))
    throw new Error('INVALID_AI_PLAYERS');
  const players = state.players
    .filter(p => playerIds.includes(p.id) && !p.eliminated && !p.locked)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  let seed = state.random.ai,
    work = 0,
    candidates = 0,
    expanded = 0,
    fallbacks = 0;
  const plans = players.map(p => {
    const view = projectView(state, p.id);
    const plan = planWizardTurn(view, seed, {
      difficulty,
      maxWork: Math.min(MAX_POLICY_WORK, Math.max(0, maxWork - work)),
    });
    seed = plan.seed;
    work += plan.work;
    candidates += plan.candidates;
    expanded += plan.expanded;
    return { playerId: p.id, ...plan };
  });
  if (plans.some(p => p.truncated)) return { state, work, candidates, expanded, fallbacks, truncated: true };
  let next = state;
  const envelope = (playerId: string, type: string) => ({
    matchId: next.matchId,
    playerId,
    turn: next.turn,
    commandId: `ai-${next.turn}-${type}-${next.revision}`,
    expectedRevision: next.revision,
  });
  if (players.length)
    next = applySystemCommand(next, {
      ...envelope('$system', 'stream'),
      type: 'AdvanceAiStream',
      before: state.random.ai,
      after: seed,
    }).state;
  for (const plan of plans) {
    for (const order of plan.orders) {
      const command = { ...envelope(plan.playerId, 'order'), type: 'SetOrder' as const, order };
      try {
        next = applyCommand(next, command).state;
      } catch {
        // No error details, alternate targets or placement probes reach the policy.
        const fallback: Order = { creatureId: order.creatureId, path: [], early: null, late: null };
        fallbacks++;
        next = applyCommand(next, { ...command, order: fallback }).state;
      }
    }
    next = applyCommand(next, { ...envelope(plan.playerId, 'lock'), type: 'LockTurn' }).state;
  }
  return { state: next, work, candidates, expanded, fallbacks, truncated: false };
}
