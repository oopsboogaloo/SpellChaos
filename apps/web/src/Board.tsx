import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '../../../packages/views/src/index.js';
import { fromOffset, distance, inside, disk, type Hex } from '../../../packages/geometry/src/hex.js';
import type { Order } from '../../../packages/domain/src/state.js';
import type { LogEvent } from './EventLog.js';
import { hexKey, type Selectable } from './targeting.js';
const radius = 18;
const point = (h: Hex) => ({ x: 32 + Math.sqrt(3) * radius * (h.q + h.r / 2), y: 32 + radius * 1.5 * h.r });
export function Board({
  view,
  selected,
  path,
  onSelect,
  onTarget,
  onPath,
  onCommand,
  marked = [],
  selectable = null,
  results = [],
}: {
  view: PlayerView;
  selected: string;
  path: Hex[];
  onSelect: (id: string) => void;
  onTarget: (id: string) => void;
  onPath: (h: Hex) => void;
  /** Click handler for select mode: the clicked hex and the top creature on it, if any. */
  onCommand?: (h: Hex, creatureId: string | undefined) => void;
  /** Hexes to highlight, such as Tangleweed cells being chosen. */
  marked?: Hex[];
  /** While a command is pending, only these are bright; everything else is greyed out. */
  selectable?: Selectable | null;
  /** Events from the turn just resolved, shown as marks beside the creatures involved. */
  results?: LogEvent[];
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [mode, setMode] = useState('select'),
    [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 }),
    [message, setMessage] = useState(''),
    [pulse, setPulse] = useState(0);
  // The selected creature gently pulses so it is easy to spot (unless the player prefers reduced motion).
  useEffect(() => {
    if (!selected || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setPulse(performance.now()), 60);
    return () => clearInterval(timer);
  }, [selected]);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ multi: false, points: [] as { x: number; y: number }[] });
  // Sized so the whole 30 × 30 board fits at zoom 1.
  const width = 984,
    height = 848;
  useEffect(() => {
    const c = canvas.current!,
      ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101824';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    function hex(h: Hex, fill: string, stroke = '#364354') {
      const p = point(h);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = ((i * 60 - 30) * Math.PI) / 180;
        ctx.lineTo(p.x + radius * Math.cos(a), p.y + radius * Math.sin(a));
      }
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
    for (let row = 0; row < view.board.rows; row++)
      for (let column = 0; column < view.board.columns; column++) hex(fromOffset({ row, column }), '#182435');
    for (const d of view.darkness)
      for (const h of disk(d.centre, 1 + Math.floor(d.level / 3)))
        if (inside(h, view.board)) hex(h, '#080810', '#b6a3e0');
    for (const patch of view.tangleweed) for (const cell of patch.cells) hex(cell.hex, '#37543b');
    for (const wall of view.walls) {
      const a = point(wall.edge.a),
        b = point(wall.edge.b),
        mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2,
        dx = (b.x - a.x) / Math.sqrt(3) / 2,
        dy = (b.y - a.y) / Math.sqrt(3) / 2;
      ctx.beginPath();
      ctx.moveTo(mx - dy, my + dx);
      ctx.lineTo(mx + dy, my - dx);
      ctx.strokeStyle = wall.material === 'fire' ? '#ff9254' : wall.material === 'crystal' ? '#a8e9ee' : '#d9d1c2';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    for (const h of marked) hex(h, '#2f6b3a', '#9be29a');
    for (const corpse of view.corpses) {
      const p = point(corpse.centre);
      ctx.fillStyle = '#8a7a6a';
      ctx.font = '16px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('✝', p.x, p.y + 5);
    }
    const colours = ['#e0b44c', '#5aa9e6', '#e0605a', '#7bc96f', '#b58be0', '#e08bc4', '#5fd0c0', '#d0d0d0'];
    const healthColour: Record<string, string> = { healthy: '#6fd36f', wounded: '#e7c34a', critical: '#e5604f' };
    plans(true);
    for (const c of view.creatures) {
      const index = view.players.findIndex(p => p.id === c.controller),
        colour = index < 0 ? '#9a9a9a' : colours[index % colours.length]!;
      for (const h of c.occupied) hex(h, `${colour}33`, c.id === selected ? '#ffda7e' : `${colour}aa`);
      const p = point(c.centre),
        r =
          radius *
          (0.8 + Math.floor((c.size - 1) / 2) * 1.5) *
          (c.id === selected && pulse ? 1 + 0.09 * Math.sin(pulse / 220) : 1);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = c.height === 'air' ? '#1d2b3c' : '#0f1722';
      ctx.fill();
      ctx.lineWidth = c.id === selected ? 4 : 2.5;
      ctx.strokeStyle = c.id === selected ? '#ffda7e' : colour;
      if (c.height === 'air') ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.round(Math.min(16, r * 0.7))}px system-ui`;
      ctx.textAlign = 'center';
      const short = c.species.replace(
        /^(The|Giant|Greater|Ancient|Haunting|Walking|Snake|Grasping|Thorn|Fey|Elven|Siege)\s+/,
        '',
      );
      ctx.fillText(short.slice(0, 7), p.x, p.y + 4);
      ctx.font = '11px system-ui';
      ctx.fillStyle = colour;
      ctx.fillText(index < 0 ? '◇' : `P${index + 1}`, p.x, p.y - r * 0.45);
      // Health bar under the token.
      const share = c.health === 'healthy' ? 1 : c.health === 'wounded' ? 0.6 : c.health === 'critical' ? 0.3 : 0.05;
      ctx.fillStyle = '#00000088';
      ctx.fillRect(p.x - r * 0.7, p.y + r * 0.45, r * 1.4, 4);
      ctx.fillStyle = healthColour[c.health] ?? '#888';
      ctx.fillRect(p.x - r * 0.7, p.y + r * 0.45, r * 1.4 * share, 4);
    }
    // Planned orders: an arrow along each move, a line to each target, and a badge for each action.
    function arrow(points: { x: number; y: number }[], colour: string, dashed: boolean, width: number) {
      if (points.length < 2) return;
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      if (dashed) ctx.setLineDash([7, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      const a = points.at(-2)!,
        b = points.at(-1)!,
        angle = Math.atan2(b.y - a.y, b.x - a.x),
        size = 6 + width * 1.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - size * Math.cos(angle - 0.45), b.y - size * Math.sin(angle - 0.45));
      ctx.lineTo(b.x - size * Math.cos(angle + 0.45), b.y - size * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.lineWidth = 1;
    }
    const savedPath = (o: Order | undefined) => o?.path ?? [];
    // Drawn twice: lines under the tokens, badges on top of them.
    function plans(lines: boolean) {
      for (const o of view.orders) {
        const c = view.creatures.find(x => x.id === o.creatureId);
        if (!c) continue;
        const mine = c.id === selected,
          teleport =
            typeof o.early === 'object' && o.early?.type === 'Cast' && o.early.spell === 'Teleport'
              ? o.early.ground
              : null,
          start = teleport ?? c.centre,
          end = o.path.at(-1) ?? start;
        if (lines && o.path.length) {
          arrow([start, ...o.path].map(point), mine ? '#ffd26c' : '#ffd26c99', false, mine ? 3.5 : 2.5);
          // A faint outline where the creature will end its move.
          const e = point(end);
          ctx.beginPath();
          ctx.arc(e.x, e.y, radius * (0.8 + Math.floor((c.size - 1) / 2) * 1.5), 0, Math.PI * 2);
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = '#ffd26c';
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const badges: string[] = [];
        for (const [action, from] of [
          [o.early, c.centre],
          [o.late, end],
        ] as const) {
          if (action === null) continue;
          if (typeof action === 'string') {
            badges.push(action === 'Defend' ? '⛉' : action === 'TotalDefence' ? '⛨' : action === 'Dash' ? '»' : '•');
            continue;
          }
          const isCast = action.type === 'Cast';
          badges.push(isCast ? '✦' : action.type === 'Attack' ? '⚔' : '•');
          const targetId = 'targetIds' in action ? action.targetIds[0] : 'targetId' in action ? action.targetId : null;
          const target = targetId
            ? (view.creatures.find(x => x.id === targetId) ?? view.corpses.find(x => x.id === targetId))
            : null;
          const to = target?.centre ?? ('ground' in action ? action.ground : null);
          if (lines && to && !(to.q === from.q && to.r === from.r)) {
            const colour = isCast ? '#c58bff' : '#ff6b5a';
            arrow([point(from), point(to)], mine ? colour : `${colour}99`, true, mine ? 3 : 2);
            const t = point(to);
            ctx.beginPath();
            ctx.arc(t.x, t.y, radius * 0.55, 0, Math.PI * 2);
            ctx.strokeStyle = colour;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.lineWidth = 1;
          }
        }
        // Badges sit at the creature's top right: before-moving action first, then after-moving.
        const p = point(c.centre),
          r = radius * (0.8 + Math.floor((c.size - 1) / 2) * 1.5);
        if (!lines)
          badges.forEach((b, i) => {
            const x = p.x + r * 0.75 + i * 15,
              y = p.y - r * 0.75;
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#1b2433';
            ctx.fill();
            ctx.strokeStyle = '#e8e2d0';
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(b, x, y + 4);
          });
      }
    }
    plans(false);
    // What happened last turn, beside each creature involved.
    if (!selectable) {
      const marks = new Map<string, { text: string; colour: string }[]>();
      const note = (id: string | undefined, text: string, colour: string) => {
        if (!id) return;
        marks.set(id, [...(marks.get(id) ?? []), { text, colour }]);
      };
      const damage = new Map<string, number>(),
        healed = new Map<string, number>();
      for (const e of results) {
        if (e.type === 'DamageApplied' && e.creatureId)
          damage.set(e.creatureId, (damage.get(e.creatureId) ?? 0) + (e.amount ?? 0));
        if (e.type === 'Healed' && e.creatureId)
          healed.set(e.creatureId, (healed.get(e.creatureId) ?? 0) + (e.amount ?? 0));
        if (e.type === 'AttackMissed') note(e.targetId, 'missed', '#c8c8c8');
        if (e.type === 'CastFailed') note(e.creatureId, 'spell failed', '#ff8a7a');
        if (e.type === 'CastInvalid') note(e.creatureId, 'spell fizzled', '#ff8a7a');
        if (e.type === 'CastInterrupted') note(e.creatureId, 'interrupted', '#ff8a7a');
        if (e.type === 'CreatureSummoned') note(e.creatureId, 'new', '#9be29a');
      }
      for (const [id, n] of damage) note(id, n > 0 ? `−${n}` : 'no damage', n > 0 ? '#ff6b5a' : '#c8c8c8');
      for (const [id, n] of healed) note(id, `+${n}`, '#7be07b');
      for (const [id, list] of marks) {
        const c = view.creatures.find(x => x.id === id);
        if (!c) continue;
        const p = point(c.centre),
          r = radius * (0.8 + Math.floor((c.size - 1) / 2) * 1.5);
        ctx.font = 'bold 12px system-ui';
        ctx.textAlign = 'center';
        list.forEach((m, i) => {
          const x = p.x,
            y = p.y - r - 4 - i * 13;
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#000';
          ctx.strokeText(m.text, x, y);
          ctx.fillStyle = m.colour;
          ctx.fillText(m.text, x, y);
        });
        ctx.lineWidth = 1;
        ctx.textAlign = 'center';
      }
    }
    // Pending command: grey out everything that cannot be chosen and outline what can.
    if (selectable) {
      const open = new Set(selectable.hexes.map(hexKey));
      for (const c of view.creatures)
        if (selectable.creatures.includes(c.id) || c.id === selected) for (const h of c.occupied) open.add(hexKey(h));
      for (const corpse of view.corpses) if (selectable.corpses.includes(corpse.id)) open.add(hexKey(corpse.centre));
      for (let row = 0; row < view.board.rows; row++)
        for (let column = 0; column < view.board.columns; column++) {
          const h = fromOffset({ row, column });
          if (!open.has(hexKey(h))) hex(h, '#05080dc0', '#05080dc0');
        }
      for (const h of selectable.hexes) hex(h, '#9be29a1a', '#9be29a');
      for (const c of view.creatures)
        if (selectable.creatures.includes(c.id)) for (const h of c.occupied) hex(h, '#ff6b5a22', '#ff8a7a');
      for (const corpse of view.corpses)
        if (selectable.corpses.includes(corpse.id)) hex(corpse.centre, '#c58bff22', '#c58bff');
    }
    const actor = view.creatures.find(c => c.id === selected);
    const saved = view.orders.find(o => o.creatureId === selected);
    if (actor && path.length && JSON.stringify(path) !== JSON.stringify(savedPath(saved))) {
      ctx.beginPath();
      [actor.centre, ...path].forEach((h, i) => {
        const p = point(h);
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      ctx.strokeStyle = '#ffd26c';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const [i, h] of path.entries()) {
        const p = point(h);
        ctx.fillStyle = '#fff';
        ctx.fillText(String(i + 1), p.x, p.y - 8);
      }
    }
    ctx.restore();
  }, [view, selected, path, zoom, pan, marked, selectable, results, pulse]);
  function location(e: React.PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - box.left) * width) / box.width, y: ((e.clientY - box.top) * height) / box.height };
  }
  function pick(p: { x: number; y: number }, previous?: Hex) {
    let best: Hex | null = null,
      d = Infinity;
    for (let row = 0; row < view.board.rows; row++)
      for (let column = 0; column < view.board.columns; column++) {
        const h = fromOffset({ row, column }),
          v = point(h),
          n = Math.hypot((p.x - pan.x) / zoom - v.x, (p.y - pan.y) / zoom - v.y);
        if (n < d) {
          best = h;
          d = n;
        }
      }
    if (!best || d > radius || !inside(best, view.board)) return;
    if (mode === 'path') {
      const actor = view.creatures.find(c => c.id === selected),
        last = previous ?? path.at(-1) ?? actor?.centre;
      if (view.phase !== 'planning' || view.self.locked || actor?.controller !== view.self.id) return;
      if (last && distance(last, best) === 1) {
        onPath(best);
        setMessage(`Added ${best.q}, ${best.r}`);
        return best;
      } else setMessage('Choose a neighbouring hex to extend the path.');
      return;
    }
    const c = [...view.creatures].reverse().find(c => c.occupied.some(h => distance(h, best!) === 0));
    if (onCommand) {
      onCommand(best, c?.id);
      if (c) setMessage(`${c.species}: ${c.health}`);
      return;
    }
    if (c) {
      if (c.controller === view.self.id) onSelect(c.id);
      else onTarget(c.id);
      setMessage(`${c.species}: ${c.health}`);
    }
  }
  return (
    <div>
      <div className="board-tools" aria-label="Board tools">
        {['select', 'path', 'pan'].map(m => (
          <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === 'select' ? 'Select / target' : m === 'path' ? 'Draw path' : 'Pan board'}
          </button>
        ))}
        <button onClick={() => setZoom(z => Math.min(3, z + 0.25))}>Zoom in</button>
        <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>Zoom out</button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </button>
      </div>
      <canvas
        ref={canvas}
        width={width}
        height={height}
        aria-label="Tactical hex arena"
        style={{ width: '100%', maxWidth: 'calc(82vh * 984 / 848)', touchAction: 'none', display: 'block' }}
        onPointerDown={e => {
          if (e.currentTarget.hasPointerCapture(e.pointerId) === false) {
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* Synthetic accessibility input may have no active pointer. */
            }
          }
          const p = location(e);
          pointers.current.set(e.pointerId, p);
          if (pointers.current.size === 1) gesture.current = { multi: false, points: [p] };
          else gesture.current.multi = true;
        }}
        onPointerMove={e => {
          const old = pointers.current.get(e.pointerId);
          if (!old) return;
          const p = location(e),
            other = [...pointers.current.entries()].find(([id]) => id !== e.pointerId)?.[1];
          if (other) {
            const before = Math.hypot(old.x - other.x, old.y - other.y),
              after = Math.hypot(p.x - other.x, p.y - other.y);
            if (before > 1) setZoom(z => Math.max(0.5, Math.min(3, (z * after) / before)));
          } else if (mode === 'pan') setPan(v => ({ x: v.x + p.x - old.x, y: v.y + p.y - old.y }));
          else if (!gesture.current.multi) gesture.current.points.push(p);
          pointers.current.set(e.pointerId, p);
        }}
        onPointerUp={e => {
          if (!gesture.current.multi && mode !== 'pan') {
            let previous: Hex | undefined;
            for (const p of mode === 'path' ? gesture.current.points : [location(e)])
              previous = pick(p, previous) ?? previous;
          }
          pointers.current.delete(e.pointerId);
        }}
        onPointerCancel={e => pointers.current.delete(e.pointerId)}
        onLostPointerCapture={e => pointers.current.delete(e.pointerId)}
      />
      <p aria-live="polite">
        {message ||
          'Player numbers identify ownership. Gold outlines mark selection; numbered lines show your draft path.'}
      </p>
    </div>
  );
}
