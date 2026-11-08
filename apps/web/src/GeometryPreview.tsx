import { useEffect, useRef, useState } from 'react';
import { footprint, fromOffset, key, worldPoint } from '../../../packages/geometry/src/hex.js';
import { startingPositions } from '../../../packages/engine/src/spawn.js';
import { emptyArena, placement } from '../../../packages/geometry/src/occupancy.js';

export function GeometryPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(3),
    [players, setPlayers] = useState(8);
  const [column, setColumn] = useState(15),
    [row, setRow] = useState(15);
  const centre = fromOffset({ column, row });
  const cells = footprint(centre, size);
  const fits = placement(
    emptyArena(),
    { id: 'preview', centre, size, controller: null, intelligence: 3, height: 'ground' },
    centre,
  ).legal;
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 660, 590);
    const selected = new Set(footprint(fromOffset({ column, row }), size).map(key));
    const starts = startingPositions(players, 123).positions;
    for (let r = 0; r < 30; r++)
      for (let c = 0; c < 30; c++) {
        const hex = fromOffset({ column: c, row: r }),
          p = worldPoint(hex);
        const x = 18 + p.x * 21,
          y = 18 + p.y * 21;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = ((i * 60 - 90) * Math.PI) / 180;
          const px = x + (21 / Math.sqrt(3)) * Math.cos(angle),
            py = y + (21 / Math.sqrt(3)) * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = selected.has(key(hex)) ? (fits ? '#b38b3d' : '#ae5050') : '#202c3b';
        ctx.fill();
        ctx.strokeStyle = '#465365';
        ctx.stroke();
        const index = starts.findIndex(s => key(s) === key(hex));
        if (index !== -1) {
          ctx.fillStyle = '#b7e2e6';
          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#13212b';
          ctx.font = 'bold 12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(index + 1), x, y);
        }
      }
  }, [size, players, column, row, fits]);
  return (
    <section aria-label="Geometry preview">
      <h2>Arena geometry preview</h2>
      <p>30 × 30 hexes. Numbered markers show wizard starts; the highlighted area shows the selected footprint.</p>
      <div className="geometry-controls">
        <label>
          Size{' '}
          <select value={size} onChange={e => setSize(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </label>
        <label>
          Players{' '}
          <select value={players} onChange={e => setPlayers(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7, 8].map(n => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <label>
          Column{' '}
          <input
            type="number"
            min="0"
            max="29"
            value={column}
            onChange={e => setColumn(Math.max(0, Math.min(29, Math.trunc(Number(e.target.value)))))}
          />
        </label>
        <label>
          Row{' '}
          <input
            type="number"
            min="0"
            max="29"
            value={row}
            onChange={e => setRow(Math.max(0, Math.min(29, Math.trunc(Number(e.target.value)))))}
          />
        </label>
      </div>
      <p role="status">
        {cells.length} occupied hexes · {fits ? 'Legal footprint' : 'Footprint extends beyond arena'}
      </p>
      <canvas
        ref={canvas}
        width="660"
        height="590"
        aria-label="Hex arena with footprint and numbered wizard starts"
        role="img"
        style={{ width: '100%', height: 'auto' }}
      />
    </section>
  );
}
