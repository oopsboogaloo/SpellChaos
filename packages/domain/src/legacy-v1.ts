import { z } from 'zod';

export const VERSION = {
  schema: 1, rules: 'foundation-0.1', content: 'empty-0.1', rng: 'xorshift32-v1',
} as const;
const id = z.string().min(1).max(128);
const uint = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rngState = z.number().int().min(1).max(0xffffffff);
export const commandSchema = z.strictObject({
  matchId: id, playerId: id, turn: uint.min(1), commandId: id,
  expectedRevision: uint, type: z.literal('LockTurn'),
});
export type Command = z.infer<typeof commandSchema>;
export const stateSchema = z.strictObject({
  schemaVersion: z.literal(VERSION.schema), rulesVersion: z.literal(VERSION.rules),
  contentVersion: z.literal(VERSION.content), rngVersion: z.literal(VERSION.rng),
  matchId: id, revision: uint, turn: uint.min(1),
  phase: z.enum(['planning', 'ready']),
  random: z.strictObject({ setup: rngState, resolution: rngState, ai: rngState }),
  players: z.array(z.strictObject({ id, locked: z.boolean() })).min(2).max(8),
  accepted: z.array(z.strictObject({ command: commandSchema, revision: uint.min(1) })),
}).superRefine((state, ctx) => {
  const ids = state.players.map(p => p.id);
  const invalid = (message: string) => ctx.addIssue({ code: 'custom', message });
  if (new Set(ids).size !== ids.length) invalid('DUPLICATE_PLAYER');
  const keys = state.accepted.map(a => a.command.commandId);
  if (new Set(keys).size !== keys.length) invalid('DUPLICATE_COMMAND');
  if (state.revision !== state.accepted.length) invalid('INVALID_REVISION');
  if ((state.phase === 'ready') !== state.players.every(p => p.locked)) invalid('INVALID_PHASE');
  const locked = new Set<string>();
  state.accepted.forEach((a, i) => {
    if (!ids.includes(a.command.playerId) || a.command.matchId !== state.matchId ||
        a.command.turn !== state.turn || a.revision !== i + 1 || a.command.expectedRevision !== i ||
        locked.has(a.command.playerId)) invalid('INVALID_COMMAND_HISTORY');
    locked.add(a.command.playerId);
  });
  if (state.players.some(p => p.locked !== locked.has(p.id))) invalid('INVALID_LOCK_STATE');
});
export type GameState = z.infer<typeof stateSchema>;
