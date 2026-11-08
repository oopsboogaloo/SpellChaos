import { useEffect, useState } from 'react';
import type { PlayerView } from '../../../packages/views/src/index.js';
import type { Order } from '../../../packages/domain/src/state.js';
import type { CastAction, SpellFamily } from '../../../packages/domain/src/spells.js';
import { manaCost, successChance, castingTime, spellRange } from '../../../packages/content/src/spells.js';
import { describeCreature } from '../../../packages/content/src/descriptions.js';
import type { LogEvent, Seen, TurnLog } from './EventLog.js';
import { creatureName } from './EventLog.js';

type Creature = PlayerView['creatures'][number];
export type { Pending, PowerAction } from './targeting.js';
import type { Pending, PowerAction } from './targeting.js';

export const GROUND_SPELLS = ['Teleport', 'Darkness', 'Tangleweed', 'Wall'];
export function spellAim(spell: SpellFamily): Extract<Pending, { kind: 'cast' }>['aim'] {
  if (spell === 'Tangleweed') return 'cells';
  if (spell.startsWith('Summon ') || GROUND_SPELLS.includes(spell)) return 'ground';
  if (spell === 'Reanimate') return 'corpse';
  if (spell === 'Magic Bolt' || spell === 'Fire Bolt') return 'either';
  return 'creature';
}
export function pendingHint(p: Pending): string {
  if (!p) return '';
  if (p.kind === 'move') return 'Click a bright hex to move there. The route is planned for you.';
  if (p.kind === 'attack')
    return p.attack.mode === 'area' ? 'Click a bright hex to strike.' : 'Click a highlighted creature to attack.';
  if (p.kind === 'power')
    return p.action === 'Haunt' ? 'Click a bright hex to haunt.' : `Click a highlighted creature for ${p.label}.`;
  if (p.aim === 'cells')
    return `Click ${p.cast.level} connected ${p.cast.level === 1 ? 'hex' : 'hexes'} for Tangleweed, then press Done.`;
  if (p.aim === 'ground')
    return p.cast.spell.startsWith('Summon ')
      ? `Click a bright hex to place the ${p.cast.spell.slice(7).toLowerCase()}. It must be empty and within ${spellRange(p.cast)} hexes.`
      : `Click a bright hex for ${p.cast.spell}.`;
  if (p.aim === 'corpse') return 'Click a highlighted corpse to reanimate.';
  if (p.aim === 'either') return `Click a highlighted creature or hex for ${p.cast.spell}.`;
  return `Click a highlighted creature for ${p.cast.spell}.`;
}

const pretty = (s: string) =>
  s === 'TotalDefence'
    ? 'Total Defence'
    : s === 'RootNetwork'
      ? 'Root network'
      : s === 'MarkQuarry'
        ? 'Mark quarry'
        : s;

/** Short label for a planned action, as shown on its button. */
export function shortAction(a: Order['early'], unit: Creature | undefined, view: PlayerView): string {
  if (a === null) return '';
  if (typeof a === 'string') return pretty(a);
  const name = (id: string | null | undefined) => view.creatures.find(c => c.id === id)?.species;
  if (a.type === 'Cast') {
    const on = a.targetId ? name(a.targetId) : a.ground ? 'hex' : '';
    return `${a.spell} ${a.level}${on ? ` → ${on}` : ''}`;
  }
  if (a.type === 'Attack') {
    const attack = unit?.attacks.find(t => t.id === a.attackId)?.name ?? 'Attack';
    return `${attack}${a.targetIds.length ? ` → ${name(a.targetIds[0]) ?? 'target'}` : a.ground ? ' → hex' : ''}`;
  }
  if ('targetId' in a && a.targetId) return `${pretty(a.type)} → ${name(a.targetId) ?? 'target'}`;
  return pretty(a.type);
}

/** The top of the screen: who is selected, its stats and what it is. Enemies are shown darker and read-only. */
export function CreatureHeader({
  view,
  creature,
  onPrev,
  onNext,
}: {
  view: PlayerView;
  creature: Creature;
  onPrev: () => void;
  onNext: () => void;
}) {
  const mine = creature.controller === view.self.id,
    owned = view.players.some(p => p.id === creature.controller),
    title = mine
      ? creature.species
      : `${owned ? 'Enemy' : 'Unbound'} ${creature.species}${creature.illusion ? ' (illusion)' : ''}`;
  return (
    <div className={mine ? 'creature-header' : 'creature-header enemy'} aria-label="Selected creature">
      <div className="creature-title">
        <h2>{title}</h2>
        <p className="vitals">
          {mine ? (
            <>
              HP {creature.hp}/{creature.maxHp} · Mana {creature.mana}/{creature.maxMana} · Move {creature.stats.move}
            </>
          ) : (
            <>
              {creature.health} · Move {creature.stats.move} · Size {creature.size}
              {creature.attacks.length
                ? ` · ${creature.attacks.map(a => `${a.name} (reach ${a.range})`).join(', ')}`
                : ''}
            </>
          )}
          {creature.height === 'air' ? ' · Flying' : ''}
          {creature.restrained ? ' · Restrained' : ''}
        </p>
        <div className="prev-next">
          <button onClick={onPrev}>Prev</button>
          <button onClick={onNext}>Next</button>
        </div>
      </div>
      {describeCreature(creature.species) && <p className="description">{describeCreature(creature.species)}</p>}
    </div>
  );
}

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

export function LastTurnRow({
  view,
  log,
  creatureId,
  seen,
}: {
  view: PlayerView;
  log: TurnLog[];
  creatureId: string;
  seen?: Seen;
}) {
  const last = log.find(t => t.turn === view.turn - 1);
  const s = last ? lastTurnSummary(last.events, creatureId, creatureName(view, seen)) : null;
  return (
    <div className="turn-row" role="group" aria-label="Last turn">
      <span className="row-label">Last turn:</span>
      {!s ? (
        <span className="slot past wide">—</span>
      ) : s.summoned ? (
        <span className="slot past wide">Summoned</span>
      ) : (
        <>
          <span className="slot past">{s.early}</span>
          <span className="slot past">{s.move}</span>
          <span className="slot past">{s.late}</span>
        </>
      )}
    </div>
  );
}

type Slot = 'early' | 'late';
/** This turn's plan: Action · Move · Action, each set by clicking it. */
export function ThisTurnRow({
  view,
  unit,
  order,
  pending,
  setPending,
  onAction,
  onWholeTurn,
  onStay,
}: {
  view: PlayerView;
  unit: Creature;
  order: Order | undefined;
  pending: Pending;
  setPending: (p: Pending, slot?: Slot) => void;
  onAction: (a: Order['early'], slot: Slot) => void;
  onWholeTurn: (a: 'TotalDefence') => void;
  onStay: () => void;
}) {
  const [menu, setMenu] = useState<Slot | null>(null),
    [spells, setSpells] = useState(false),
    [spell, setSpell] = useState<SpellFamily | null>(null),
    [level, setLevel] = useState(1),
    [variant, setVariant] = useState<CastAction['variant']>('bound');
  useEffect(() => {
    setMenu(null);
    setSpells(false);
    setSpell(null);
  }, [unit.id]);
  const close = () => {
    setMenu(null);
    setSpells(false);
    setSpell(null);
  };
  const whole = order?.early === 'TotalDefence' || order?.late === 'TotalDefence';
  const label = (slot: Slot) => shortAction(order?.[slot] ?? null, unit, view) || 'Action';
  const book = unit.spellbook ?? [];
  const maxLevel = unit.planning?.spellLevelCap ?? 8;
  const cast: CastAction | null = spell
    ? {
        type: 'Cast',
        spell,
        level: Math.min(level, maxLevel),
        variant: spell.startsWith('Summon ') ? variant : 'bound',
        targetId: null,
        ground: null,
        side: 'left',
      }
    : null;
  const powers: { label: string; action: PowerAction | 'Roar' | 'Wail' | 'RootNetwork' | 'Reload'; range: number }[] = [
    ...(unit.fearAction
      ? [{ label: unit.fearAction.kind, action: unit.fearAction.kind, range: unit.fearAction.range }]
      : []),
    ...(unit.gaze ? [{ label: 'Gaze', action: 'Gaze' as const, range: unit.gaze.range }] : []),
    ...(unit.spores ? [{ label: 'Spores', action: 'Spores' as const, range: unit.spores.range }] : []),
    ...(unit.wail ? [{ label: 'Wail', action: 'Wail' as const, range: 0 }] : []),
    ...(unit.rootNetwork ? [{ label: 'Root network', action: 'RootNetwork' as const, range: 0 }] : []),
    ...(unit.traits.grappleLimbs ? [{ label: 'Grapple', action: 'Grapple' as const, range: 1 }] : []),
    ...(unit.canMarkQuarry ? [{ label: 'Mark quarry', action: 'MarkQuarry' as const, range: 99 }] : []),
    ...(unit.haunt ? [{ label: 'Haunt', action: 'Haunt' as const, range: unit.haunt.range }] : []),
    ...(unit.reload ? [{ label: 'Reload', action: 'Reload' as const, range: 0 }] : []),
  ];
  function pick(slot: Slot, a: Order['early']) {
    close();
    onAction(a, slot);
  }
  function actionMenu(slot: Slot) {
    return (
      <div className="action-menu" role="menu" aria-label={slot === 'early' ? 'Before moving' : 'After moving'}>
        <button className="menu-close" aria-label="Close menu" onClick={close}>
          ✕
        </button>
        {!spells && !spell && (
          <>
            {book.length > 0 && (
              <button role="menuitem" onClick={() => setSpells(true)}>
                Cast spell ▸
              </button>
            )}
            {unit.attacks.map(a => (
              <button
                key={a.id}
                role="menuitem"
                onClick={() => {
                  if (a.mode === 'swarm' || a.mode === 'cleave')
                    return pick(slot, { type: 'Attack', attackId: a.id, targetIds: [], ground: null, side: 'left' });
                  close();
                  setPending({ kind: 'attack', attack: a }, slot);
                }}
              >
                Attack ({a.name}){a.mode === 'swarm' || a.mode === 'cleave' ? ' — all around' : ''}
              </button>
            ))}
            {powers.map(p => (
              <button
                key={p.action}
                role="menuitem"
                onClick={() =>
                  p.action === 'Roar' || p.action === 'Wail' || p.action === 'RootNetwork' || p.action === 'Reload'
                    ? pick(slot, { type: p.action })
                    : (close(), setPending({ kind: 'power', action: p.action, label: p.label, range: p.range }, slot))
                }
              >
                {p.label}
              </button>
            ))}
            <button role="menuitem" onClick={() => pick(slot, 'Defend')}>
              Defend
            </button>
            <button
              role="menuitem"
              onClick={() => {
                close();
                onWholeTurn('TotalDefence');
              }}
            >
              Total Defence (whole turn)
            </button>
            {slot === 'early' && (
              <button role="menuitem" onClick={() => pick(slot, 'Dash')}>
                Dash
              </button>
            )}
            {unit.restrained && (
              <button role="menuitem" onClick={() => pick(slot, 'Escape')}>
                Escape
              </button>
            )}
            {order?.[slot] != null && (
              <button role="menuitem" onClick={() => pick(slot, null)}>
                Nothing
              </button>
            )}
          </>
        )}
        {spells && !spell && (
          <>
            <button role="menuitem" onClick={() => setSpells(false)}>
              ◂ Back
            </button>
            {book.map(s => (
              <button
                key={s}
                role="menuitem"
                onClick={() => {
                  setSpell(s);
                  setLevel(1);
                  setSpells(false);
                }}
              >
                {s}
              </button>
            ))}
          </>
        )}
        {cast && (
          <div className="spell-config">
            <button role="menuitem" onClick={() => (setSpell(null), setSpells(true))}>
              ◂ {cast.spell}
            </button>
            <label>
              Level{' '}
              <input
                aria-label="Spell level"
                type="range"
                min="1"
                max={maxLevel}
                value={cast.level}
                onChange={e => setLevel(+e.target.value)}
              />{' '}
              {cast.level}
            </label>
            {cast.spell.startsWith('Summon ') && (
              <label>
                Variant{' '}
                <select
                  aria-label="Summon variant"
                  value={variant}
                  onChange={e => setVariant(e.target.value as CastAction['variant'])}
                >
                  <option value="bound">Bound (full cost)</option>
                  <option value="unbound">Unbound (half cost, easier, but it will not obey you)</option>
                  <option value="illusion">Illusion (half cost, always works)</option>
                </select>
              </label>
            )}
            <p>
              {manaCost(cast)} mana · {castingTime(cast.spell)} · about{' '}
              {Math.round(successChance(cast, view.balance * 2))}% chance now
              {manaCost(cast) > (unit.mana ?? 0) ? ' · not enough mana' : ''}
            </p>
            {cast.spell === 'Wall' ? (
              <p>Walls are placed from Advanced orders in the Menu for now.</p>
            ) : (
              <button
                className="primary"
                onClick={() => {
                  close();
                  setPending({ kind: 'cast', cast, aim: spellAim(cast.spell) }, slot);
                }}
              >
                {cast.spell.startsWith('Summon ') ? 'Choose where to summon' : 'Choose target'}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
  const moveLabel = order?.path.length ? `Move ${order.path.length}` : 'Move';
  return (
    <div className="turn-row" role="group" aria-label="This turn">
      <span className="row-label">This turn:</span>
      {whole ? (
        <button className="slot wide set" aria-label="Whole turn: Total Defence" onClick={() => setMenu('early')}>
          Total Defence
        </button>
      ) : (
        <>
          <span className="slot-wrap">
            <button
              className={order?.early ? 'slot set' : 'slot'}
              aria-label={`Before moving: ${label('early')}`}
              aria-expanded={menu === 'early'}
              onClick={() => (menu === 'early' ? close() : (close(), setMenu('early')))}
            >
              {label('early')}
            </button>
          </span>
          <button
            className={order?.path.length ? 'slot set' : 'slot'}
            aria-label={moveLabel}
            aria-pressed={pending?.kind === 'move'}
            onClick={() => (close(), setPending(pending?.kind === 'move' ? null : { kind: 'move' }))}
          >
            {moveLabel}
          </button>
          <span className="slot-wrap">
            <button
              className={order?.late ? 'slot set' : 'slot'}
              aria-label={`After moving: ${label('late')}`}
              aria-expanded={menu === 'late'}
              onClick={() => (menu === 'late' ? close() : (close(), setMenu('late')))}
            >
              {label('late')}
            </button>
          </span>
        </>
      )}
      {menu && actionMenu(menu)}
      {pending?.kind === 'move' && order?.path.length ? (
        <button className="slot" onClick={onStay}>
          Stay put
        </button>
      ) : null}
    </div>
  );
}
