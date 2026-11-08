import { useState } from 'react';
import type { PlayerView } from '../../../packages/views/src/index.js';

/** A projected event, exactly as projectEvents returns it for this player. */
export type LogEvent = {
  type: string;
  turn: number;
  phase: string;
  creatureId?: string;
  targetId?: string;
  playerId?: string;
  to?: { q: number; r: number };
  action?: string;
  amount?: number;
  critical?: boolean;
};
export type TurnLog = { turn: number; events: LogEvent[] };

// Bookkeeping events that carry no information a player needs to read.
const QUIET = new Set([
  'PhaseStarted',
  'PhaseEnded',
  'PathPrepared',
  'AttackFinished',
  'PowerFinished',
  'ResolutionStarted',
  'TurnStarted',
  'ActorSkipped',
]);

export function describeEvent(e: LogEvent, name: (id?: string) => string): string {
  const who = name(e.creatureId),
    whom = name(e.targetId),
    amount = e.amount === undefined ? '' : ` (${e.amount})`;
  switch (e.type) {
    case 'CreatureMoved':
      return `${who} moves`;
    case 'AttackHit':
      return `${who} hits ${whom}${e.critical ? ' — critical!' : ''}`;
    case 'AttackMissed':
      return `${who} misses ${whom}`;
    case 'AttackInvalid':
      return `${who}'s attack has no valid target`;
    case 'DamageApplied':
      return `${who} takes damage${amount}`;
    case 'Healed':
      return `${who} is healed${amount}`;
    case 'CreatureDied':
      return `${who} dies`;
    case 'CastStarted':
      return `${who} begins casting${e.action ? ` ${e.action}` : ''}`;
    case 'CastSucceeded':
      return `${who}'s spell succeeds`;
    case 'CastFailed':
      return `${who}'s spell fails`;
    case 'CastInvalid':
      return `${who}'s spell fizzles: no valid target in range and sight`;
    case 'CastInterrupted':
      return `${who}'s spell is interrupted`;
    case 'CreatureSummoned':
      return `${who} appears`;
    case 'CreatureTeleported':
      return `${who} teleports`;
    case 'MovementBlocked':
      return `${who} is blocked`;
    case 'InvisibleRevealed':
      return `${who} is revealed`;
    case 'HoldFormed':
      return `${who} grapples ${whom}`;
    case 'HoldReleased':
      return `${whom} breaks free of ${who}`;
    case 'GrappleMissed':
    case 'GrappleResisted':
      return `${who} fails to grapple ${whom}`;
    case 'PowerApplied':
      return `${who}'s power affects ${whom}`;
    case 'PowerResisted':
      return `${whom} resists ${who}'s power`;
    case 'PlayerLocked':
      return `${e.playerId ?? 'A player'} locks in`;
    case 'MatchEnded':
      return 'The match is over';
    default:
      return `${who !== 'Someone' ? `${who}: ` : ''}${e.type.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}`;
  }
}

/** Creatures the player has seen, so events about creatures that have since died can still be named. */
export type Seen = Map<string, { species: string; controller: string | null }>;
export function creatureName(view: PlayerView, seen?: Seen) {
  return (id?: string) => {
    if (!id) return 'Someone';
    const c = view.creatures.find(c => c.id === id) ?? seen?.get(id);
    if (!c) return 'A creature';
    const owner =
      c.controller === view.self.id ? '' : view.players.some(p => p.id === c.controller) ? ' (enemy)' : ' (unbound)';
    return `${c.species}${owner}`;
  };
}

// Events worth a line in the short summary of the turn just resolved.
const HEADLINE = new Set([
  'AttackHit',
  'AttackMissed',
  'DamageApplied',
  'Healed',
  'CreatureDied',
  'CastSucceeded',
  'CastFailed',
  'CastInvalid',
  'CastInterrupted',
  'CreatureSummoned',
  'HoldFormed',
  'HoldReleased',
  'PowerApplied',
  'PowerResisted',
  'MovementBlocked',
  'MatchEnded',
]);
/** Short summary of what happened in the most recent resolved turn. */
export function LastTurn({ view, log, seen }: { view: PlayerView; log: TurnLog[]; seen?: Seen }) {
  const last = log.at(-1);
  if (!last) return null;
  const name = creatureName(view, seen),
    lines = last.events.filter(e => HEADLINE.has(e.type)).map(e => describeEvent(e, name));
  return (
    <section aria-label="Last turn" className="last-turn">
      <h3>What happened in turn {last.turn}</h3>
      {lines.length === 0 ? (
        <p>Nothing notable: creatures moved or held position.</p>
      ) : (
        <ul>
          {lines.slice(0, 10).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
          {lines.length > 10 && <li>…and {lines.length - 10} more in the event log.</li>}
        </ul>
      )}
    </section>
  );
}

/** Filtered per-turn event log with review of earlier turns. */
export function EventLog({ view, log, seen }: { view: PlayerView; log: TurnLog[]; seen?: Seen }) {
  const [reviewTurn, setReviewTurn] = useState<number | null>(null),
    [showAll, setShowAll] = useState(false);
  const shown = log.find(t => t.turn === reviewTurn) ?? log.at(-1);
  const name = creatureName(view, seen);
  const events = (shown?.events ?? []).filter(e => showAll || !QUIET.has(e.type));
  return (
    <section aria-label="Event log" className="event-log">
      <h2>Event log</h2>
      {log.length === 0 ? (
        <p>No events yet. Lock your turn to see what happens.</p>
      ) : (
        <>
          <label>
            Turn{' '}
            <select
              aria-label="Review turn"
              value={shown?.turn ?? ''}
              onChange={e => setReviewTurn(+e.target.value === log.at(-1)?.turn ? null : +e.target.value)}
            >
              {log.map(t => (
                <option key={t.turn} value={t.turn}>
                  Turn {t.turn}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show every step
          </label>
          <ol>
            {events.map((e, i) => (
              <li key={i}>
                <span className="phase">{e.phase}</span> {describeEvent(e, name)}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
