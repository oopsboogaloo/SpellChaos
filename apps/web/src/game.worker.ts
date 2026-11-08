import { saveLocal, loadLocal, saveSettings, loadSettings, DEFAULT_SETTINGS, type LocalSettings } from './autosave.js';
import { createMatch, applyCommand, applySystemCommand, systemCommand } from '../../../packages/engine/src/index.js';
import { advanceAtomicStep } from '../../../packages/engine/src/resolver.js';
import { projectEvents, projectView } from '../../../packages/views/src/index.js';
import type { Event } from '../../../packages/engine/src/events.js';
import { submitAiTurn } from '../../../packages/ai/src/coordinator.js';
import { knowledgeState } from '../../../packages/ai/src/knowledge.js';
import { validateOrder, movementAllowance } from '../../../packages/engine/src/orders.js';
import { routeTowards } from '../../../packages/engine/src/navigation.js';
import { distance } from '../../../packages/geometry/src/hex.js';

// Order refusals worth explaining to the player. Planning checks use only what the player can see,
// so these codes reveal nothing hidden; anything else gets the generic message.
const REASONS: Record<string, string> = {
  INSUFFICIENT_MANA: 'Not enough mana for that spell.',
  RESTRAINED: 'That creature is restrained and cannot move.',
  FEAR_APPROACH: 'That creature is too frightened to move closer to the source of its fear.',
  INVALID_PATH: 'That route is blocked.',
  INVALID_DESTINATION: 'That creature cannot end its move there.',
  MOVEMENT_BUDGET: 'That route is longer than the creature can move this turn.',
  CASTING_IMMOBILE: 'A creature finishing a slow spell cannot move this turn.',
  CASTING_OCCUPIES_ACTION: 'This creature is busy casting and cannot take that action.',
  SUBDUED_BUDGET: 'A subdued creature can either move or act, not both.',
  TOTAL_DEFENCE_WHOLE_TURN: 'Total Defence takes the whole turn.',
  DASH_EARLY_ONLY: 'Dash can only be used before moving (Early).',
  GUARD_EARLY_ONLY: 'Guard can only be ordered before moving (Early).',
  ACTION_BUDGET: 'This creature has already used its action for that phase.',
  INVALID_SPELL_TARGET: 'That is not a valid target for this spell.',
  INVALID_SUMMON_PLACEMENT: 'The summoned creature would not fit there.',
  INVALID_TELEPORT_DESTINATION: 'The caster cannot teleport there.',
  INVALID_ATTACK_TARGETS: 'That is not a valid target for this attack.',
  UNKNOWN_TARGET: 'That target cannot be seen.',
  INVALID_POWER_TARGET: 'That is not a valid target for this power.',
  POWER_COOLDOWN: 'That power is still recovering.',
  RELOAD_REQUIRED: 'This weapon must be reloaded first.',
  SPELL_NOT_KNOWN: 'This creature cannot cast that spell at that level.',
  NOT_CONTROLLED: 'You do not control that creature.',
  ORDERS_LOCKED: 'Your orders are locked for this turn.',
};
import { encodeSnapshot, restoreSnapshot } from '../../../packages/persistence/src/snapshot.js';
import type { Order } from '../../../packages/domain/src/state.js';
let state = createMatch('local', ['human', 'ai-1'], 123);
let saveStatus = 'Local saves stay in this browser.';
let settings: LocalSettings = DEFAULT_SETTINGS;
let notice = '';
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
const send = (extra: object = {}) => {
  postMessage({ view: projectView(state, 'human'), saveStatus, log, settings, notice, ...extra });
  notice = '';
};
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
      try {
        validateOrder(knowledge, order, 'human');
      } catch (e) {
        // Most creatures get one action a turn: a new action replaces the one planned for the other phase.
        if (
          !(e instanceof Error) ||
          e.message !== 'ACTION_BUDGET' ||
          !(data.phase === 'early' || data.phase === 'late')
        )
          throw e;
        const other = data.phase === 'early' ? 'late' : 'early';
        if (order[other] === null) throw e;
        order[other] = null;
        validateOrder(knowledge, order, 'human');
        notice = `This creature has one action a turn, so this replaces its ${other === 'early' ? 'before-moving' : 'after-moving'} action.`;
      }
      state = command('SetOrder', order);
    }
    if (data.type === 'moveTo') {
      // Click-to-move: plan a legal route with the same pathfinder the AI uses, over what the player can see,
      // then keep the creature's other orders and save the new path.
      const view = projectView(state, 'human'),
        knowledge = knowledgeState(view),
        previous = state.orders.find(o => o.creatureId === data.creatureId),
        actor = knowledge.creatures.find(c => c.id === data.creatureId);
      if (!actor) throw new Error('NOT_CONTROLLED');
      const base = { creatureId: actor.id, path: [], early: previous?.early ?? null, late: previous?.late ?? null };
      // An Early Teleport moves the creature first, so the route starts at its destination.
      const start =
        base.early && typeof base.early === 'object' && base.early.type === 'Cast' && base.early.spell === 'Teleport'
          ? base.early.ground
          : null;
      const route = routeTowards(
        knowledge,
        start ? { ...actor, centre: start } : actor,
        movementAllowance(actor, base),
        c => distance(c.centre, data.to),
        c => distance(c.centre, data.to) === 0,
        1800,
      );
      const order = {
        ...base,
        path: route.path,
        ...(route.flightSteps?.length ? { flightSteps: route.flightSteps } : {}),
      };
      validateOrder(knowledge, order, 'human');
      state = command('SetOrder', order);
      notice =
        route.path.length === 0
          ? 'No route found towards that hex.'
          : route.reached
            ? ''
            : 'Moving as far as possible this turn.';
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
  } catch (e) {
    const reason = e instanceof Error ? REASONS[e.message] : undefined;
    send({ error: reason ?? 'That request could not be completed. Check your order or save file.' });
  }
}
let queue = Promise.resolve();
onmessage = ({ data }) => {
  queue = queue.then(() => handle(data));
};
