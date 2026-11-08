import { stateSchema, type GameState } from '../../domain/src/state.js';

/** Canonical JSON for verified, JSON-safe engine data. */
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    return (
      '{' +
      Object.keys(record)
        .sort()
        .map(k => JSON.stringify(k) + ':' + canonical(record[k]))
        .join(',') +
      '}'
    );
  }
  throw new Error('NON_PORTABLE_VALUE');
}
export function encodeSnapshot(state: GameState): string {
  return canonical(stateSchema.parse(state));
}
export function restoreSnapshot(text: string): GameState {
  // Parse into a candidate; caller replaces its running state only after success.
  try {
    return stateSchema.parse(JSON.parse(text));
  } catch {
    throw new Error('INVALID_OR_UNSUPPORTED_SNAPSHOT');
  }
}
