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

export const pretty = (s: string) =>
  s === 'TotalDefence'
    ? 'Total Defence'
    : s === 'RootNetwork'
      ? 'Root network'
      : s === 'MarkQuarry'
        ? 'Mark quarry'
        : s;

/** What actually happened to one creature last turn, split into before moving, moving and after moving. */
export function lastTurnSummary(
  events: LogEvent[],
  id: string,
  name: (id?: string) => string,
): { summoned: boolean; early: string; move: string; late: string } {
  const own = events.filter(e => e.creatureId === id);
  const summoned = events.some(e => e.type === 'CreatureSummoned' && e.creatureId === id);
  const outcome: Record<string, string> = {
    CastSucceeded: 'succeeded',
    CastFailed: 'failed',
    CastInvalid: 'fizzled',
    CastInterrupted: 'interrupted',
  };
  const action = (phase: 'early' | 'late') => {
    const here = own.filter(e => e.phase === phase);
    const cast = here.find(e => e.type === 'CastStarted');
    if (cast) {
      const result = own.find(e => outcome[e.type] && events.indexOf(e) > events.indexOf(cast));
      return `Cast ${cast.action ?? 'spell'} ${result ? outcome[result.type] : '(still casting)'}`;
    }
    if (here.some(e => e.type === 'CastInvalid')) return 'Spell fizzled';
    // A slow spell started on an earlier turn finishes (or is interrupted) here without a new CastStarted.
    const finished = here.find(e => e.type === 'CastSucceeded' || e.type === 'CastFailed');
    if (finished) return `${finished.action ?? 'Spell'} ${outcome[finished.type]}`;
    if (here.some(e => e.type === 'CastInterrupted')) return 'Spell interrupted';
    const hits = here.filter(e => e.type === 'AttackHit'),
      misses = here.filter(e => e.type === 'AttackMissed');
    if (hits.length || misses.length) {
      const first = hits[0] ?? misses[0]!;
      const more = hits.length + misses.length > 1 ? ` (+${hits.length + misses.length - 1})` : '';
      return `${hits.length ? 'Hit' : 'Missed'} ${name(first.targetId)}${more}`;
    }
    const resolved = here.find(e => e.type === 'ActionResolved');
    return resolved?.action ? pretty(resolved.action) : '—';
  };
  const steps = own.filter(
    e => e.phase === 'movement' && ['CreatureMoved', 'CreatureBlinked', 'FlightChanged'].includes(e.type),
  ).length;
  const blocked = own.some(e => e.type === 'MovementBlocked');
  return {
    summoned,
    early: action('early'),
    move: steps ? `Moved ${steps}${blocked ? ' (blocked)' : ''}` : blocked ? 'Blocked' : '—',
    late: action('late'),
  };
}
