import { saveLocal, loadLocal, saveSettings, loadSettings, DEFAULT_SETTINGS, type LocalSettings } from './autosave.js';
import { createMatch, applyCommand, applySystemCommand, systemCommand } from '../../../packages/engine/src/index.js';
import { advanceAtomicStep } from '../../../packages/engine/src/resolver.js';
import { projectEvents, projectView } from '../../../packages/views/src/index.js';
import type { Event } from '../../../packages/engine/src/events.js';
import { submitAiTurn } from '../../../packages/ai/src/coordinator.js';
import { knowledgeState } from '../../../packages/ai/src/knowledge.js';
import { validateOrder } from '../../../packages/engine/src/orders.js';
import { encodeSnapshot, restoreSnapshot } from '../../../packages/persistence/src/snapshot.js';
import type { Order } from '../../../packages/domain/src/state.js';
let state = createMatch('local', ['human', 'ai-1'], 123);
let saveStatus = 'Local saves stay in this browser.';
let settings: LocalSettings = DEFAULT_SETTINGS;
// The human player's permitted events, grouped by turn (most recent 20 turns, kept in memory).
let log: { turn: number; events: ReturnType<typeof projectEvents> }[] = [];
function record(events: readonly Event[]) {
  for (const e of projectEvents(state, 'human', events)) {
    if (e.type === 'TurnStarted') continue; // bookkeeping; would open an empty entry for the next turn
    let turn = log.find(t => t.turn === e.turn);
    if (!turn) log.push((turn = { turn: e.turn, events: [] }));
    turn.events.push(e);
  }
  log = log.slice(-20);
}
function step() {
  const r = advanceAtomicStep(state);
  state = r.state;
  record(r.events);
}
const send = (extra: object = {}) =>
  postMessage({ view: projectView(state, 'human'), saveStatus, log, settings, ...extra });
function command(type: 'LockTurn' | 'SetOrder', order?: Order) {
  const base = {
    matchId: state.matchId,
    playerId: 'human',
    turn: state.turn,
    commandId: `ui-${state.revision}`,
    expectedRevision: state.revision,
  };
  return type === 'SetOrder'
    ? applyCommand(state, { ...base, type, order: order! }).state
    : applyCommand(state, { ...base, type }).state;
}
async function handle(data: any) {
  try {
    const before = state;
    if (data.type === 'continue') {
      const saved = await loadLocal();
      if (!saved) throw new Error('NO_LOCAL_SAVE');
      state = saved.state;
      log = [];
      settings = await loadSettings();
      saveStatus = saved.recovered ? 'Recovered the previous local checkpoint.' : 'Continued local match.';
      send();
      return;
    }
    if (data.type === 'new') {
      log = [];
      settings = {
        difficulty: ['easy', 'standard', 'hard'].includes(data.difficulty) ? data.difficulty : 'standard',
        timerSeconds: Math.max(0, Math.min(600, Math.floor(Number(data.timerSeconds) || 0))),
      };
      await saveSettings(settings).catch(() => undefined);
    }
    if (data.type === 'new')
      state = createMatch(
        'local',
        [
          'human',
          ...Array.from({ length: Math.max(1, Math.min(7, Number(data.opponents) || 1)) }, (_, i) => `ai-${i + 1}`),
        ],
        Number(data.seed) || 123,
      );
    if (data.type === 'order') {
      // Validate only observed facts before the authoritative submission. Never return private rejection details.
      const previous = state.orders.find(o => o.creatureId === data.order.creatureId);
      const order =
        data.phase === 'early' || data.phase === 'late'
          ? {
              ...previous,
              ...data.order,
              early: data.phase === 'early' ? data.order.early : (previous?.early ?? null),
              late: data.phase === 'late' ? data.order.late : (previous?.late ?? null),
            }
          : data.order;
      const view = projectView(state, 'human'),
        knowledge = knowledgeState(view);
      knowledge.holds = structuredClone(view.holds);
      // Projected restraint includes visible holds; let the hold model validate Drag.
      // Other unobserved restraint remains subject to authoritative validation.
      if (order.dragTargetId)
        for (const c of knowledge.creatures)
          if (
            (c.id === order.creatureId || c.id === order.dragTargetId) &&
            view.holds.some(h => h.grapplerId === order.creatureId && h.targetId === order.dragTargetId)
          )
            c.restrained = false;
      validateOrder(knowledge, order, 'human');
      state = command('SetOrder', order);
    }
    if (data.type === 'clear')
      state = applyCommand(state, {
        matchId: state.matchId,
        playerId: 'human',
        turn: state.turn,
        commandId: `ui-${state.revision}`,
        expectedRevision: state.revision,
        type: 'ClearOrder',
        creatureId: data.creatureId,
      }).state;
    if (data.type === 'suggest') state = submitAiTurn(state, ['human'], settings.difficulty).state;
    if (data.type === 'lock') {
      let next = state;
      try {
        if (!state.players[0]!.locked) state = command('LockTurn');
        state = submitAiTurn(
          state,
          state.players.filter(p => p.id !== 'human').map(p => p.id),
          settings.difficulty,
        ).state;
        const started = applySystemCommand(state, systemCommand(state, 'StartResolution', `start-${state.turn}`));
        state = started.state;
        record(started.events);
      } catch (e) {
        state = next;
        throw e;
      }
    }
    if (data.type === 'deadline' && state.phase === 'planning' && !state.players[0]!.locked) {
      // Planning time ran out: AI seats submit, then the engine's deadline rules lock or default the human.
      const next = state;
      try {
        state = submitAiTurn(
          state,
          state.players.filter(p => p.id !== 'human' && !p.locked).map(p => p.id),
          settings.difficulty,
        ).state;
        const deadline = applySystemCommand(state, systemCommand(state, 'DeadlineReached', `deadline-${state.turn}`));
        state = deadline.state;
        record(deadline.events);
        if (state.phase === 'ready') {
          const started = applySystemCommand(state, systemCommand(state, 'StartResolution', `start-${state.turn}`));
          state = started.state;
          record(started.events);
        }
      } catch (e) {
        state = next;
        throw e;
      }
    }
    if (data.type === 'step' && !['planning', 'ended'].includes(state.phase)) step();
    if (data.type === 'resolve')
      for (let n = 0; !['planning', 'ended'].includes(state.phase); n++) {
        if (n > 20000) throw new Error('STEP_LIMIT');
        step();
      }
    if (data.type === 'load') {
      const candidate = restoreSnapshot(data.text);
      projectView(candidate, 'human');
      state = candidate;
      log = [];
    }
    if (data.type === 'save') {
      send({ save: encodeSnapshot(state) });
      return;
    }
    if (state !== before) {
      try {
        await saveLocal(state);
        saveStatus = 'Saved locally.';
      } catch {
        saveStatus = 'Local save failed. Export a private save to keep this match.';
      }
    }
    send();
  } catch {
    send({ error: 'That request could not be completed. Check your order or save file.' });
  }
}
let queue = Promise.resolve();
onmessage = ({ data }) => {
  queue = queue.then(() => handle(data));
};
