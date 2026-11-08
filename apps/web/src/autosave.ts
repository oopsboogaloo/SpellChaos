import type { GameState } from '../../../packages/domain/src/state.js';
import { encodeSnapshot, restoreSnapshot } from '../../../packages/persistence/src/snapshot.js';
import { projectView } from '../../../packages/views/src/index.js';
const database = 'spell-chaos-local',
  storeName = 'checkpoints';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('STORAGE_BLOCKED'));
  });
}
function valid(text: unknown): GameState {
  if (typeof text !== 'string') throw new Error('INVALID_LOCAL_SAVE');
  const state = restoreSnapshot(text);
  projectView(state, 'human');
  return state;
}
/** Atomic rotation retains a valid previous checkpoint if a write is interrupted. */
export async function saveLocal(state: GameState): Promise<void> {
  const text = encodeSnapshot(state),
    db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite'),
        store = tx.objectStore(storeName);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('SAVE_ABORTED'));
      tx.onerror = () => reject(tx.error);
      const request = store.get('current');
      request.onsuccess = () => {
        try {
          valid(request.result);
          store.put(request.result, 'previous');
        } catch {
          /* Preserve the previous recovery record when current is corrupt or absent. */
        }
        store.put(text, 'current');
      };
    });
  } finally {
    db.close();
  }
}
export async function loadLocal(): Promise<{ state: GameState; recovered: boolean } | null> {
  const db = await open();
  let records: unknown[];
  try {
    records = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly'),
        store = tx.objectStore(storeName),
        current = store.get('current'),
        previous = store.get('previous');
      tx.oncomplete = () => resolve([current.result, previous.result]);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  for (const [index, text] of records.entries()) {
    try {
      return { state: valid(text), recovered: index === 1 };
    } catch {
      /* Try the previous fully committed checkpoint. */
    }
  }
  if (records.some(r => r !== undefined)) throw new Error('NO_VALID_LOCAL_SAVE');
  return null;
}
export type LocalSettings = { difficulty: 'easy' | 'standard' | 'hard'; timerSeconds: number };
export const DEFAULT_SETTINGS: LocalSettings = { difficulty: 'standard', timerSeconds: 90 };
/** Session settings live beside the checkpoint; they are not game state. */
export async function saveSettings(settings: LocalSettings): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(storeName).put(JSON.stringify(settings), 'settings');
    });
  } finally {
    db.close();
  }
}
export async function loadSettings(): Promise<LocalSettings> {
  const db = await open();
  try {
    const text = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly'),
        request = tx.objectStore(storeName).get('settings');
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
    const parsed = typeof text === 'string' ? JSON.parse(text) : {};
    return {
      difficulty: ['easy', 'standard', 'hard'].includes(parsed.difficulty)
        ? parsed.difficulty
        : DEFAULT_SETTINGS.difficulty,
      timerSeconds:
        Number.isInteger(parsed.timerSeconds) && parsed.timerSeconds >= 0
          ? parsed.timerSeconds
          : DEFAULT_SETTINGS.timerSeconds,
    };
  } catch {
    return DEFAULT_SETTINGS;
  } finally {
    db.close();
  }
}
