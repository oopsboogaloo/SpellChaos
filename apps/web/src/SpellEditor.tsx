import { useState } from 'react';
import type { PlayerView } from '../../../packages/views/src/index.js';
import type { Order } from '../../../packages/domain/src/state.js';
import type { CastAction, SpellFamily } from '../../../packages/domain/src/spells.js';
import { manaCost, successChance, castingTime } from '../../../packages/content/src/spells.js';
import { DIRECTIONS, add, type Hex } from '../../../packages/geometry/src/hex.js';
export function SpellEditor({
  view,
  unit,
  q,
  r,
  path,
  timing,
  onSave,
}: {
  view: PlayerView;
  unit: PlayerView['creatures'][number];
  q: number;
  r: number;
  path: Hex[];
  timing: 'early' | 'late';
  onSave: (order: Order) => void;
}) {
  const [spell, setSpell] = useState<SpellFamily>('Disbelief'),
    [level, setLevel] = useState(1),
    [variant, setVariant] = useState<CastAction['variant']>('bound'),
    [target, setTarget] = useState(''),
    [side, setSide] = useState<'left' | 'right'>('left'),
    [cells, setCells] = useState<Hex[]>([]),
    [edges, setEdges] = useState<{ a: Hex; b: Hex }[]>([]),
    [direction, setDirection] = useState(0);
  const book = unit.spellbook ?? [],
    chosen = book.includes(spell) ? spell : book[0];
  if (!chosen) return null;
  const groundOnly = chosen.startsWith('Summon ') || ['Teleport', 'Darkness', 'Tangleweed', 'Wall'].includes(chosen),
    projectile = ['Magic Bolt', 'Fire Bolt'].includes(chosen);
  const ground =
    chosen === 'Tangleweed' ? (cells[0] ?? { q, r }) : chosen === 'Wall' ? (edges[0]?.a ?? { q, r }) : { q, r };
  const cast: CastAction = {
    type: 'Cast',
    spell: chosen,
    level,
    variant: chosen.startsWith('Summon ') ? variant : 'bound',
    targetId: groundOnly ? null : target || null,
    ground: groundOnly || (projectile && !target) ? ground : null,
    side,
    ...(chosen === 'Tangleweed' ? { hexes: cells } : {}),
    ...(chosen === 'Wall' ? { edges } : {}),
  };
  const disabled = view.phase !== 'planning' || view.self.locked;
  return (
    <details>
      <summary>Cast a spell</summary>
      <label>
        Spell family{' '}
        <select
          value={chosen}
          onChange={e => {
            setSpell(e.target.value as SpellFamily);
            setCells([]);
            setEdges([]);
            setTarget('');
          }}
        >
          {book.map(s => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <label>
        Spell level{' '}
        <select value={level} onChange={e => setLevel(+e.target.value)}>
          {Array.from({ length: unit.planning?.spellLevelCap ?? 8 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>
      {chosen.startsWith('Summon ') && (
        <label>
          Summon variant{' '}
          <select value={variant} onChange={e => setVariant(e.target.value as CastAction['variant'])}>
            {['bound', 'unbound', 'illusion'].map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      )}
      {!groundOnly && (
        <label>
          Spell target{' '}
          <select value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">{projectile ? 'Ground coordinates' : 'Choose target'}</option>
            {(chosen === 'Reanimate' ? view.corpses : view.creatures).map(c => (
              <option key={c.id} value={c.id}>
                {c.species} ({c.id})
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Ray side{' '}
        <select value={side} onChange={e => setSide(e.target.value as 'left' | 'right')}>
          <option>left</option>
          <option>right</option>
        </select>
      </label>
      <p>
        Ground coordinates: {q}, {r}. Use the coordinate fields above.
      </p>
      {chosen === 'Tangleweed' && (
        <>
          <button disabled={disabled || cells.length >= level} onClick={() => setCells(c => [...c, { q, r }])}>
            Add spell hex
          </button>
          <button onClick={() => setCells(c => c.slice(0, -1))}>Undo spell hex</button>
          <p>Spell hexes: {cells.map(h => `${h.q},${h.r}`).join(' → ')}</p>
        </>
      )}
      {chosen === 'Wall' && (
        <>
          <label>
            Wall direction{' '}
            <select value={direction} onChange={e => setDirection(+e.target.value)}>
              {DIRECTIONS.map((d, i) => (
                <option key={i} value={i}>
                  {d.q}, {d.r}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={disabled || edges.length >= level + 2}
            onClick={() => setEdges(e => [...e, { a: { q, r }, b: add({ q, r }, DIRECTIONS[direction]!) }])}
          >
            Add wall edge
          </button>
          <button onClick={() => setEdges(e => e.slice(0, -1))}>Undo wall edge</button>
          <p>Wall edges: {edges.map(e => `${e.a.q},${e.a.r} to ${e.b.q},${e.b.r}`).join('; ')}</p>
        </>
      )}
      <p>
        Mana {manaCost(cast)} · {castingTime(chosen)} · Current success estimate {successChance(cast, view.balance * 2)}
        %. Resolution balance may change. Hidden occupants may affect the outcome.
      </p>
      <button
        disabled={disabled}
        onClick={() =>
          onSave({
            creatureId: unit.id,
            path,
            early: timing === 'early' ? cast : null,
            late: timing === 'late' ? cast : null,
          })
        }
      >
        Save spell draft
      </button>
    </details>
  );
}
