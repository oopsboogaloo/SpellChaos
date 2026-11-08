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

/** Filtered per-turn event log with review of earlier turns. */
export function EventLog({ view, log }: { view: PlayerView; log: TurnLog[] }) {
  const [reviewTurn, setReviewTurn] = useState<number | null>(null),
    [showAll, setShowAll] = useState(false);
  const shown = log.find(t => t.turn === reviewTurn) ?? log.at(-1);
  const name = (id?: string) => {
    if (!id) return 'Someone';
    const c = view.creatures.find(c => c.id === id);
    return c ? `${c.species}${c.controller === view.self.id ? '' : ' (enemy)'}` : 'A creature';
  };
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
