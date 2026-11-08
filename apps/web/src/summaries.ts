/** A projected event, exactly as projectEvents returns it for this player. */
export type LogEvent = {
  type: string;
  turn: number;
  phase: string;
  creatureId?: string;
  targetId?: string;
  sourceId?: string;
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
): { summoned: boolean; early: string; move: string; late: string; took: string } {
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
    // One entry per target: hits, misses, critical hits and damage (exact damage only where the rules show it).
    const strikes = here.filter(e => e.type === 'AttackHit' || e.type === 'AttackMissed');
    if (strikes.length) {
      const targets = [...new Set(strikes.map(e => e.targetId))];
      return targets
        .map(t => {
          const hits = strikes.filter(e => e.targetId === t && e.type === 'AttackHit'),
            misses = strikes.filter(e => e.targetId === t && e.type === 'AttackMissed').length,
            // Each hit's damage is the first damage event that follows it for that target from this attacker,
            // so retaliation such as bristles (also sourced from this creature) is not counted as the hit.
            dealt = hits
              .map(hit =>
                events
                  .slice(events.indexOf(hit) + 1)
                  .find(e => e.type === 'DamageApplied' && e.creatureId === t && e.sourceId === id),
              )
              .filter((e): e is LogEvent => !!e),
            amount = dealt.reduce((n, e) => n + (e.amount ?? 0), 0),
            known = dealt.some(e => e.amount !== undefined);
          if (!hits.length) return `Missed ${name(t)}${misses > 1 ? ` ×${misses}` : ''}`;
          const detail = [
            hits.length > 1 ? `×${hits.length}` : '',
            known ? `${amount} dmg` : '',
            hits.some(e => e.critical) ? 'critical' : '',
            misses ? `${misses} missed` : '',
          ].filter(Boolean);
          return `Hit ${name(t)}${detail.length ? ` (${detail.join(', ')})` : ''}`;
        })
        .join('; ');
    }
    const resolved = here.find(e => e.type === 'ActionResolved');
    return resolved?.action ? pretty(resolved.action) : '—';
  };
  const steps = own.filter(
    e => e.phase === 'movement' && ['CreatureMoved', 'CreatureBlinked', 'FlightChanged'].includes(e.type),
  ).length;
  const blocked = own.some(e => e.type === 'MovementBlocked');
  // Damage this creature took over the whole turn, grouped by who (or what) caused it.
  const taken = new Map<string, number>();
  for (const e of events)
    if (e.type === 'DamageApplied' && e.creatureId === id && e.amount) {
      const from = e.sourceId ? name(e.sourceId).replace(/ \((enemy|unbound)\)$/, '') : (e.action ?? 'unknown');
      taken.set(from, (taken.get(from) ?? 0) + e.amount);
    }
  const total = [...taken.values()].reduce((a, b) => a + b, 0);
  const took = !total
    ? ''
    : taken.size === 1
      ? `Took ${total} damage from ${[...taken.keys()][0]}`
      : `Took ${total} damage: ${[...taken].map(([from, n]) => `${from} ${n}`).join(', ')}`;
  return {
    took,
    summoned,
    early: action('early'),
    move: steps ? `Moved ${steps}${blocked ? ' (blocked)' : ''}` : blocked ? 'Blocked' : '—',
    late: action('late'),
  };
}
