import { useState } from 'react';
import type { PlayerView } from '../../../packages/views/src/index.js';
import type { Order } from '../../../packages/domain/src/state.js';
import type { CastAction, SpellFamily } from '../../../packages/domain/src/spells.js';
import { manaCost, successChance, castingTime } from '../../../packages/content/src/spells.js';
import { footprint, nearestPair, type Hex } from '../../../packages/geometry/src/hex.js';

type Creature = PlayerView['creatures'][number];
type Attack = Creature['attacks'][number];
/** What the next board click means. */
export type Pending =
  | { kind: 'move' }
  | { kind: 'attack'; attack: Attack }
  | { kind: 'cast'; cast: CastAction; aim: 'creature' | 'ground' | 'either' | 'corpse' | 'cells' }
  | null;

export const GROUND_SPELLS = ['Teleport', 'Darkness', 'Tangleweed', 'Wall'];
export function spellAim(spell: SpellFamily): Exclude<Pending, null | { kind: 'move' | 'attack' }>['aim'] {
  if (spell === 'Tangleweed') return 'cells';
  if (spell.startsWith('Summon ') || GROUND_SPELLS.includes(spell)) return 'ground';
  if (spell === 'Reanimate') return 'corpse';
  if (spell === 'Magic Bolt' || spell === 'Fire Bolt') return 'either';
  return 'creature';
}
export function pendingHint(p: Pending): string {
  if (!p) return '';
  if (p.kind === 'move') return 'Click a hex to move there. The route is planned for you.';
  if (p.kind === 'attack') return p.attack.mode === 'area' ? 'Click the hex to strike.' : 'Click a creature to attack.';
  if (p.aim === 'cells') return `Click up to ${p.cast.level} connected hexes for Tangleweed, then press Done.`;
  if (p.aim === 'ground') return `Click a hex for ${p.cast.spell}.`;
  if (p.aim === 'corpse') return 'Click a corpse to reanimate.';
  if (p.aim === 'either') return `Click a creature or a hex for ${p.cast.spell}.`;
  return `Click a creature for ${p.cast.spell}.`;
}

/** Plain description of a planned action. */
export function describeAction(a: Order['early'], unit: Creature | undefined, view: PlayerView): string {
  if (a === null) return 'nothing';
  if (typeof a === 'string') return a === 'TotalDefence' ? 'Total Defence' : a;
  const name = (id: string | null | undefined) => view.creatures.find(c => c.id === id)?.species ?? 'a target';
  if (a.type === 'Cast')
    return `cast ${a.spell} (level ${a.level})${a.targetId ? ` on ${name(a.targetId)}` : a.ground ? ` at a hex` : ''}`;
  if (a.type === 'Attack') {
    const attack = unit?.attacks.find(t => t.id === a.attackId);
    return `${attack?.name ?? 'attack'}${a.targetIds.length ? ` ${name(a.targetIds[0])}` : ''}`;
  }
  return a.type;
}

function endOfMove(unit: Creature, order: Order | undefined): Hex {
  return order?.path.at(-1) ?? unit.centre;
}
/** Distance from where the creature ends its planned move to the target, for a reach warning. */
export function reachNote(unit: Creature, order: Order | undefined, target: Creature, attack: Attack): string {
  const d = nearestPair(footprint(endOfMove(unit, order), unit.size), target.occupied).distance;
  if (d > attack.range) return `Out of reach from where it ends its move (distance ${d}, reach ${attack.range}).`;
  if (d < attack.minRange) return `Too close for ${attack.name} (minimum ${attack.minRange}).`;
  return '';
}

export function CommandPanel({
  view,
  unit,
  order,
  timing,
  setTiming,
  pending,
  setPending,
  onAction,
  onClear,
  cells,
  onCellsDone,
}: {
  view: PlayerView;
  unit: Creature;
  order: Order | undefined;
  timing: 'early' | 'late';
  setTiming: (t: 'early' | 'late') => void;
  pending: Pending;
  setPending: (p: Pending) => void;
  onAction: (a: Order['early']) => void;
  onClear: () => void;
  cells: Hex[];
  onCellsDone: () => void;
}) {
  const [spell, setSpell] = useState<SpellFamily | ''>(''),
    [level, setLevel] = useState(1),
    [variant, setVariant] = useState<CastAction['variant']>('bound');
  const planning = view.phase === 'planning' && !view.self.locked;
  const book = unit.spellbook ?? [];
  const chosen = (spell && book.includes(spell) ? spell : '') as SpellFamily | '';
  const cast: CastAction | null = chosen
    ? {
        type: 'Cast',
        spell: chosen,
        level,
        variant: chosen.startsWith('Summon ') ? variant : 'bound',
        targetId: null,
        ground: null,
        side: 'left',
      }
    : null;
  const maxLevel = unit.planning?.spellLevelCap ?? 8;
  const simple: [string, Order['early']][] = [
    ['Defend', 'Defend'],
    ['Total Defence', 'TotalDefence'],
    ...(timing === 'early' ? ([['Dash', 'Dash']] as [string, Order['early']][]) : []),
  ];
  return (
    <section aria-label="Commands" className="commands">
      <h2>{unit.species}</h2>
      <p className="vitals">
        HP {unit.hp}/{unit.maxHp} · Mana {unit.mana}/{unit.maxMana} · Move {unit.stats.move}
        {unit.restrained ? ' · Restrained' : ''}
      </p>
      <div aria-label="Planned order" className="summary">
        <p>Move: {order?.path.length ? `${order.path.length} hexes` : 'stay put'}</p>
        <p>Before moving: {describeAction(order?.early ?? null, unit, view)}</p>
        <p>After moving: {describeAction(order?.late ?? null, unit, view)}</p>
      </div>
      {planning ? (
        <>
          <div className="segmented" role="group" aria-label="When to act">
            <button aria-pressed={timing === 'early'} onClick={() => setTiming('early')}>
              Act before moving
            </button>
            <button aria-pressed={timing === 'late'} onClick={() => setTiming('late')}>
              Act after moving
            </button>
          </div>
          <div className="command-buttons">
            <button aria-pressed={pending?.kind === 'move'} onClick={() => setPending({ kind: 'move' })}>
              Move
            </button>
            {unit.attacks.map(a => (
              <button
                key={a.id}
                aria-pressed={pending?.kind === 'attack' && pending.attack.id === a.id}
                onClick={() =>
                  a.mode === 'swarm' || a.mode === 'cleave'
                    ? onAction({ type: 'Attack', attackId: a.id, targetIds: [], ground: null, side: 'left' })
                    : setPending({ kind: 'attack', attack: a })
                }
              >
                {a.mode === 'swarm' || a.mode === 'cleave' ? `${a.name} (all around)` : `Attack: ${a.name}`}
              </button>
            ))}
            {simple.map(([label, action]) => (
              <button key={label} onClick={() => onAction(action)}>
                {label}
              </button>
            ))}
            <button onClick={onClear}>Clear orders</button>
          </div>
          {book.length > 0 && (
            <div aria-label="Spells" className="spells">
              <h3>Spells</h3>
              <div className="command-buttons">
                {book.map(s => (
                  <button
                    key={s}
                    aria-pressed={chosen === s}
                    onClick={() => {
                      setSpell(s);
                      setLevel(1);
                      setPending(null);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {cast && (
                <div className="spell-config">
                  <label>
                    Level{' '}
                    <input
                      aria-label="Spell level"
                      type="range"
                      min="1"
                      max={maxLevel}
                      value={level}
                      onChange={e => setLevel(+e.target.value)}
                    />{' '}
                    {level}
                  </label>
                  {chosen.startsWith('Summon ') && (
                    <label>
                      Variant{' '}
                      <select
                        aria-label="Summon variant"
                        value={variant}
                        onChange={e => setVariant(e.target.value as CastAction['variant'])}
                      >
                        <option value="bound">Bound (full cost)</option>
                        <option value="unbound">Summon only (half cost, easier)</option>
                        <option value="illusion">Illusion (half cost, always works)</option>
                      </select>
                    </label>
                  )}
                  <p>
                    {manaCost(cast)} mana · {castingTime(cast.spell)} · about {successChance(cast, view.balance * 2)}%
                    chance now
                    {manaCost(cast) > (unit.mana ?? 0) ? ' · not enough mana' : ''}
                  </p>
                  {chosen === 'Wall' ? (
                    <p>Walls are placed in Advanced orders below for now.</p>
                  ) : (
                    <button
                      aria-pressed={pending?.kind === 'cast'}
                      onClick={() => setPending({ kind: 'cast', cast, aim: spellAim(cast.spell) })}
                    >
                      Choose target for {cast.spell}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {pending && (
            <p className="hint" role="status" aria-label="Board instruction">
              {pendingHint(pending)}{' '}
              {pending.kind === 'cast' && pending.aim === 'cells' && (
                <button disabled={cells.length === 0} onClick={onCellsDone}>
                  Done ({cells.length})
                </button>
              )}{' '}
              <button onClick={() => setPending(null)}>Cancel</button>
            </p>
          )}
        </>
      ) : (
        <p>Orders are locked. Resolve the turn to see what happens.</p>
      )}
    </section>
  );
}

/** Read-only card for any creature the player clicks. */
export function InspectCard({ view, creature }: { view: PlayerView; creature: Creature }) {
  const owner = view.players.findIndex(p => p.id === creature.controller);
  return (
    <section aria-label="Inspect" className="inspect">
      <h3>
        {creature.species}
        {creature.illusion ? ' (illusion)' : ''}
      </h3>
      <p>
        {creature.controller === view.self.id ? 'Yours' : owner >= 0 ? `Player ${owner + 1}` : 'Unbound'} ·{' '}
        {creature.health}
        {creature.height === 'air' ? ' · flying' : ''}
        {creature.restrained ? ' · restrained' : ''}
      </p>
      <p>
        Size {creature.size} · Move {creature.stats.move} · Dex {creature.stats.dex} · Int {creature.stats.intelligence}
      </p>
      <ul>
        {creature.attacks.map(a => (
          <li key={a.id}>
            {a.name}: reach {a.range}
            {a.minRange ? ` (min ${a.minRange})` : ''}, skill {a.shots[0]?.skill ?? '?'}
          </li>
        ))}
      </ul>
    </section>
  );
}
