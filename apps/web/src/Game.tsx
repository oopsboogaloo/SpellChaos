import { TacticalOrders } from './TacticalOrders.js';
import { SpellEditor } from './SpellEditor.js';
import { Board } from './Board.js';
import { EventLog, type Seen, type TurnLog } from './EventLog.js';
import { selectable as selectableFor, hexKey } from './targeting.js';
import { CreatureHeader, LastTurnRow, ThisTurnRow, pendingHint, type Pending } from './CommandPanel.js';
import type { Hex } from '../../../packages/geometry/src/hex.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerView } from '../../../packages/views/src/index.js';
import type { Order } from '../../../packages/domain/src/state.js';
export function Game() {
  const worker = useRef<Worker | null>(null),
    [view, setView] = useState<PlayerView | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [pending, setPending] = useState<Pending>(null),
    [inspect, setInspect] = useState(''),
    [menuOpen, setMenuOpen] = useState(false),
    [cells, setCells] = useState<Hex[]>([]),
    [log, setLog] = useState<TurnLog[]>([]),
    [saveStatus, setSaveStatus] = useState(''),
    [selected, setSelected] = useState('wizard-0'),
    [target, setTarget] = useState(''),
    [q, Q] = useState(0),
    [r, R] = useState(0),
    [path, setPath] = useState<{ q: number; r: number }[]>([]),
    [action, setAction] = useState('TotalDefence'),
    [timing, setTiming] = useState<'early' | 'late'>('early'),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(80),
    [opponents, setOpponents] = useState(1),
    [seed, setSeed] = useState(123),
    [difficulty, setDifficulty] = useState('standard'),
    [timerSeconds, setTimerSeconds] = useState(90),
    [settings, setSettings] = useState<{ difficulty: string; timerSeconds: number } | null>(null),
    [remaining, setRemaining] = useState<number | null>(null),
    [attackId, setAttackId] = useState(''),
    [attackSide, setAttackSide] = useState<'left' | 'right'>('left');
  const seen = useRef<Seen>(new Map());
  for (const c of view?.creatures ?? []) seen.current.set(c.id, { species: c.species, controller: c.controller });
  const send = (data: object) => {
    setError('');
    worker.current?.postMessage(data);
  };
  useEffect(() => {
    const w = new Worker(new URL('./game.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = ({ data }) => {
      setView(data.view);
      setLog(data.log ?? []);
      if (data.settings) setSettings(data.settings);
      setSaveStatus(data.saveStatus ?? '');
      setError(data.error ?? '');
      setNotice(data.notice ?? '');
      if (data.save) {
        const url = URL.createObjectURL(new Blob([data.save], { type: 'application/json' })),
          a = document.createElement('a');
        a.href = url;
        a.download = 'spell-chaos-private-save.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    };
    w.postMessage({ type: 'view' });
    return () => w.terminate();
  }, []);
  useEffect(() => {
    if (!running || !view || ['planning', 'ended'].includes(view.phase)) return;
    const timer = setTimeout(() => send({ type: 'step' }), speed);
    return () => clearTimeout(timer);
  }, [running, view, speed]);
  // Planning timer: restarts each planning turn; on expiry the worker applies the deadline rules.
  const timerKey = view && view.phase === 'planning' && !view.self.locked ? `${view.turn}` : '';
  useEffect(() => {
    if (!timerKey || !settings?.timerSeconds) return setRemaining(null);
    const end = Date.now() + settings.timerSeconds * 1000;
    setRemaining(settings.timerSeconds);
    const tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(tick);
        send({ type: 'deadline' });
        setRunning(true);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [timerKey, settings?.timerSeconds]);
  const unit = view?.creatures.find(c => c.id === selected),
    planning = view?.phase === 'planning' && !view.self.locked;
  const choose = (id: string) => {
    setSelected(id);
    setPending(null);
    setCells([]);
    setTiming(view?.orders.find(o => o.creatureId === id)?.path.length ? 'late' : 'early');
    setPath(view?.orders.find(o => o.creatureId === id)?.path ?? []);
    setAttackId('');
    const c = view?.creatures.find(c => c.id === id);
    if (c) {
      Q(c.centre.q);
      R(c.centre.r);
    }
  };
  const savedOrder = view?.orders.find(o => o.creatureId === selected);
  // Keep the drawn path in step with the saved order (click-to-move saves on the worker side).
  const savedPathKey = JSON.stringify(savedOrder?.path ?? []);
  useEffect(() => setPath(savedOrder?.path ?? []), [savedPathKey, selected]);
  // Esc cancels the pending board command.
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending(null);
        setCells([]);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);
  /** Save one action for the current phase, keeping the saved path and the other phase. */
  function act(a: Order['early'], slot: 'early' | 'late' = timing) {
    if (!unit) return;
    send({
      type: 'order',
      phase: slot,
      order: {
        creatureId: unit.id,
        path: savedOrder?.path ?? [],
        ...(savedOrder?.flightSteps ? { flightSteps: savedOrder.flightSteps } : {}),
        early: slot === 'early' ? a : null,
        late: slot === 'late' ? a : null,
      },
    });
    setPending(null);
    setCells([]);
  }
  // What the pending command may use, so the board can grey out everything else.
  const options = useMemo(
    () => (view && unit && pending ? selectableFor(view, unit.id, savedOrder, pending, timing, cells) : null),
    [view, unit?.id, savedOrder, pending, timing, cells],
  );
  /** Board click: carry out the pending command, or select / inspect. */
  function boardClick(h: Hex, creatureId: string | undefined) {
    const clicked = view?.creatures.find(c => c.id === creatureId);
    if (pending && options && unit) {
      const corpse = view?.corpses.find(c => c.centre.q === h.q && c.centre.r === h.r);
      const allowed =
        options.hexes.some(x => hexKey(x) === hexKey(h)) ||
        (clicked && options.creatures.includes(clicked.id)) ||
        (corpse && options.corpses.includes(corpse.id));
      if (!allowed) {
        setNotice(
          pending.kind === 'move'
            ? 'That hex is out of reach this turn. Pick one of the bright hexes.'
            : 'That is out of range or sight. Pick something bright on the board.',
        );
        return;
      }
    }
    if (!pending) {
      if (clicked && clicked.controller === view?.self.id) {
        choose(clicked.id);
        setInspect('');
      } else if (clicked) {
        setInspect(clicked.id);
        setTarget(clicked.id);
      } else setInspect('');
      Q(h.q);
      R(h.r);
      return;
    }
    if (!unit) return;
    if (pending.kind === 'move') {
      send({ type: 'moveTo', creatureId: unit.id, to: h });
      setPending(null);
      return;
    }
    if (pending.kind === 'attack') {
      const a = pending.attack;
      if (a.mode === 'area') return act({ type: 'Attack', attackId: a.id, targetIds: [], ground: h, side: 'left' });
      if (!clicked || clicked.id === unit.id) return setNotice('Click a creature to attack.');
      return act({ type: 'Attack', attackId: a.id, targetIds: [clicked.id], ground: null, side: 'left' });
    }
    if (pending.kind === 'power') {
      if (pending.action === 'Haunt') return act({ type: 'Haunt', ground: h });
      if (!clicked) return setNotice(`Click a highlighted creature for ${pending.label}.`);
      return act({ type: pending.action, targetId: clicked.id });
    }
    const cast = pending.cast;
    if (pending.aim === 'cells') {
      setCells(c => (c.some(x => x.q === h.q && x.r === h.r) || c.length >= cast.level ? c : [...c, h]));
      return;
    }
    if (pending.aim === 'corpse') {
      const corpse = view?.corpses.find(c => c.centre.q === h.q && c.centre.r === h.r);
      if (!corpse) return setNotice('Click a corpse to reanimate.');
      return act({ ...cast, targetId: corpse.id });
    }
    if (pending.aim === 'ground') return act({ ...cast, ground: h });
    if (clicked) return act({ ...cast, targetId: clicked.id });
    if (pending.aim === 'either') return act({ ...cast, ground: h });
    setNotice(`Click a creature for ${cast.spell}.`);
  }
  const attack = unit?.attacks.find(a => a.id === attackId) ?? unit?.attacks[0];
  function saveOrder(order: Order) {
    send({ type: 'order', phase: timing, order });
  }
  function draft() {
    if (!unit) return;
    let a: Order['early'];
    if (action === 'Attack') {
      if (!attack) return;
      a = {
        type: 'Attack',
        attackId: attack.id,
        targetIds: attack.mode === 'area' ? [] : [target],
        ground: attack.mode === 'area' ? { q, r } : null,
        side: attackSide,
      };
    } else if (
      ['Treat', 'Wake', 'Extinguish', 'Grapple', 'MarkQuarry', 'Mount', 'Frighten', 'Gaze', 'Spores'].includes(action)
    )
      a = { type: action as 'Treat', targetId: target };
    else if (['Haunt', 'Dismount'].includes(action)) a = { type: action as 'Haunt', ground: { q, r } };
    else if (['Reload', 'Roar', 'Wail', 'RootNetwork'].includes(action)) a = { type: action as 'Reload' };
    else a = action as 'Dash' | 'Defend' | 'TotalDefence' | 'Escape';
    saveOrder({ creatureId: selected, path, early: timing === 'early' ? a : null, late: timing === 'late' ? a : null });
  }
  const describe = (a: Order['early']) =>
    a === null
      ? 'None'
      : typeof a === 'string'
        ? a
        : a.type === 'Cast'
          ? `${a.spell}, level ${a.level}, ${a.variant}`
          : a.type === 'Attack'
            ? `Attack: ${unit?.attacks.find(t => t.id === a.attackId)?.name ?? a.attackId}`
            : a.type;

  const mine = view?.creatures.filter(c => c.controller === view.self.id) ?? [];
  const shown = (inspect && view?.creatures.find(c => c.id === inspect)) || unit;
  function cycle(step: number) {
    if (!mine.length) return;
    const at = mine.findIndex(c => c.id === selected);
    choose(mine[(at + step + mine.length) % mine.length]!.id);
    setInspect('');
  }
  function endTurn() {
    setRunning(false);
    setPending(null);
    if (view?.phase === 'planning') send({ type: 'lock' });
    send({ type: 'resolve' });
  }
  return (
    <section className="game" aria-label="Local match">
      <div className="top-strip">
        <p className="eyebrow">SPELL CHAOS</p>
        {view && (
          <p role="status">
            Turn {view.turn} · {view.phase} · Balance {view.balance}
            {view.result ? ` · ${view.result.type === 'winner' ? view.result.playerId + ' wins' : 'Draw'}` : ''}
          </p>
        )}
        {remaining !== null && (
          <p aria-label="Planning time left" className={remaining <= 10 ? 'timer urgent' : 'timer'}>
            Time left {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </p>
        )}
        <button className="menu-button" aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}>
          {menuOpen ? 'Close menu' : 'Menu'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {view && (
        <>
          <section className="command-area" aria-label="Commands">
            {shown ? (
              <CreatureHeader view={view} creature={shown} onPrev={() => cycle(-1)} onNext={() => cycle(1)} />
            ) : (
              <p>Click one of your creatures to give it orders.</p>
            )}
            {shown && shown.controller === view.self.id && (
              <div className="turn-rows">
                <div className="rows">
                  <LastTurnRow view={view} log={log} creatureId={shown.id} seen={seen.current} />
                  {planning ? (
                    <ThisTurnRow
                      view={view}
                      unit={shown}
                      order={savedOrder}
                      pending={pending}
                      setPending={(p, slot) => {
                        if (slot) setTiming(slot);
                        setPending(p);
                        setCells([]);
                      }}
                      onAction={(a, slot) => act(a, slot)}
                      onWholeTurn={a => {
                        send({ type: 'order', order: { creatureId: shown.id, path: [], early: a, late: null } });
                        setPending(null);
                      }}
                      onStay={() => {
                        send({
                          type: 'order',
                          order: {
                            creatureId: shown.id,
                            path: [],
                            early: savedOrder?.early ?? null,
                            late: savedOrder?.late ?? null,
                          },
                        });
                        setPending(null);
                      }}
                    />
                  ) : (
                    <p className="turn-row">Orders are locked. The turn is resolving.</p>
                  )}
                </div>
                <button className="end-turn primary" disabled={view.phase === 'ended'} onClick={endTurn}>
                  {view.phase === 'planning' ? 'End turn' : 'Finish turn'}
                </button>
              </div>
            )}
            {pending && (
              <p className="hint" role="status" aria-label="Board instruction">
                {pendingHint(pending)}{' '}
                {pending.kind === 'cast' && pending.aim === 'cells' && (
                  <button
                    disabled={cells.length !== pending.cast.level}
                    onClick={() => act({ ...pending.cast, ground: cells[0]!, hexes: cells })}
                  >
                    Done ({cells.length}/{pending.cast.level})
                  </button>
                )}{' '}
                <button onClick={() => (setPending(null), setCells([]))}>Cancel</button>
              </p>
            )}
            {notice && <p className="notice">{notice}</p>}
          </section>
          <div className={menuOpen ? 'game-layout with-menu' : 'game-layout'}>
            <Board
              view={view}
              selected={selected}
              path={path}
              onSelect={choose}
              onTarget={setTarget}
              onPath={h => setPath(p => [...p, h])}
              onCommand={boardClick}
              marked={cells}
              selectable={options}
              results={view.phase === 'planning' ? (log.at(-1)?.turn === view.turn - 1 ? log.at(-1)!.events : []) : []}
            />
            {menuOpen && (
              <aside className="menu-drawer" aria-label="Menu">
                <h2>Menu</h2>
                <button
                  onClick={() => {
                    setRunning(false);
                    setPath([]);
                    send({ type: 'continue' });
                  }}
                >
                  Continue local match
                </button>
                <p aria-label="Local save status">{saveStatus}</p>
                <details>
                  <summary>New match</summary>
                  <label>
                    AI opponents{' '}
                    <input
                      aria-label="AI opponents"
                      type="number"
                      min="1"
                      max="7"
                      value={opponents}
                      onChange={e => setOpponents(+e.target.value)}
                    />
                  </label>
                  <label>
                    Seed <input aria-label="Seed" type="number" value={seed} onChange={e => setSeed(+e.target.value)} />
                  </label>
                  <label>
                    AI difficulty{' '}
                    <select aria-label="AI difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                      <option value="easy">Easy</option>
                      <option value="standard">Standard</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                  <label>
                    Planning timer{' '}
                    <select
                      aria-label="Planning timer"
                      value={timerSeconds}
                      onChange={e => setTimerSeconds(+e.target.value)}
                    >
                      <option value="0">Off</option>
                      <option value="30">30 seconds</option>
                      <option value="60">60 seconds</option>
                      <option value="90">90 seconds</option>
                      <option value="180">3 minutes</option>
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      setRunning(false);
                      setPath([]);
                      send({ type: 'new', opponents, seed, difficulty, timerSeconds });
                    }}
                  >
                    Start new match
                  </button>
                </details>
                <details>
                  <summary>Turn controls</summary>
                  <button disabled={!planning} onClick={() => send({ type: 'suggest' })}>
                    Delegate this turn to AI
                  </button>
                  <button
                    disabled={view.phase !== 'planning'}
                    onClick={() => {
                      send({ type: 'lock' });
                      setRunning(true);
                    }}
                  >
                    Lock turn
                  </button>
                  <button onClick={() => setRunning(v => !v)}>{running ? 'Pause' : 'Play'}</button>
                  <button
                    disabled={['planning', 'ended'].includes(view.phase)}
                    onClick={() => {
                      setRunning(false);
                      send({ type: 'step' });
                    }}
                  >
                    Step
                  </button>
                  <button
                    disabled={['planning', 'ended'].includes(view.phase)}
                    onClick={() => {
                      setRunning(false);
                      send({ type: 'resolve' });
                    }}
                  >
                    Resolve turn
                  </button>
                  <label>
                    Playback{' '}
                    <select value={speed} onChange={e => setSpeed(+e.target.value)}>
                      <option value="250">Slow</option>
                      <option value="80">Normal</option>
                      <option value="1">Fast</option>
                    </select>
                  </label>
                </details>
                <EventLog view={view} log={log} seen={seen.current} />
                <button onClick={() => send({ type: 'save' })}>Export private save</button>
                <label>
                  Load private save{' '}
                  <input
                    type="file"
                    accept=".json"
                    onChange={async e => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setRunning(false);
                        send({ type: 'load', text: await f.text() });
                      }
                    }}
                  />
                </label>
                <details>
                  <summary>Advanced orders</summary>
                  <aside aria-label="Roster">
                    <h3>Your creatures</h3>
                    {mine.map(c => (
                      <button key={c.id} aria-pressed={selected === c.id} onClick={() => choose(c.id)}>
                        {view.orders.some(o => o.creatureId === c.id) ? '✓' : '○'} {c.species} · {c.health}
                      </button>
                    ))}
                  </aside>
                  <aside aria-label="Order editor">
                    <h2>Advanced orders</h2>
                    <p className="muted">Coordinate-based editing for {unit?.species ?? 'the selected creature'}.</p>
                    {unit && (
                      <p>
                        HP {unit.hp} · Mana {unit.mana} · Move {unit.stats.move}
                      </p>
                    )}
                    <label>
                      Path hex Q <input type="number" value={q} onChange={e => Q(+e.target.value)} />
                    </label>
                    <label>
                      Path hex R <input type="number" value={r} onChange={e => R(+e.target.value)} />
                    </label>
                    <button disabled={!planning} onClick={() => setPath(p => [...p, { q, r }])}>
                      Add path step
                    </button>
                    <button onClick={() => setPath(p => p.slice(0, -1))}>Undo path step</button>
                    <p>{path.map(h => `${h.q},${h.r}`).join(' → ') || 'Stay here'}</p>
                    <label>
                      Action{' '}
                      <select value={action} onChange={e => setAction(e.target.value)}>
                        {[
                          'TotalDefence',
                          'Defend',
                          'Dash',
                          'Escape',
                          ...(unit?.attacks.length ? ['Attack'] : []),
                          ...(unit?.handlesObjects ? ['Treat', 'Wake', 'Extinguish'] : []),
                          ...(unit?.traits.grappleLimbs ? ['Grapple'] : []),
                          ...(unit?.canMarkQuarry ? ['MarkQuarry'] : []),
                          ...(unit?.canRide ? ['Mount'] : []),
                          ...(unit?.mountId ? ['Dismount'] : []),
                          ...(unit?.reload ? ['Reload'] : []),
                          ...(unit?.haunt ? ['Haunt'] : []),
                          ...(unit?.fearAction ? [unit.fearAction.kind] : []),
                          ...(unit?.gaze ? ['Gaze'] : []),
                          ...(unit?.spores ? ['Spores'] : []),
                          ...(unit?.wail ? ['Wail'] : []),
                          ...(unit?.rootNetwork ? ['RootNetwork'] : []),
                        ].map(a => (
                          <option key={a}>{a}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Timing{' '}
                      <select value={timing} onChange={e => setTiming(e.target.value as 'early' | 'late')}>
                        <option value="early">Early</option>
                        <option value="late">Late</option>
                      </select>
                    </label>
                    <label>
                      Target{' '}
                      <select value={target} onChange={e => setTarget(e.target.value)}>
                        <option value="">Choose target</option>
                        {view.creatures.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.species} ({c.id})
                          </option>
                        ))}
                      </select>
                    </label>
                    {action === 'Attack' && (
                      <>
                        <label>
                          Attack variant{' '}
                          <select value={attack?.id ?? ''} onChange={e => setAttackId(e.target.value)}>
                            {unit?.attacks.map(a => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Attack ray side{' '}
                          <select value={attackSide} onChange={e => setAttackSide(e.target.value as 'left' | 'right')}>
                            <option>left</option>
                            <option>right</option>
                          </select>
                        </label>
                        {attack?.mode === 'area' && (
                          <p>
                            Area impact uses ground coordinates {q}, {r}.
                          </p>
                        )}
                      </>
                    )}
                    <button disabled={!planning} onClick={draft}>
                      Save draft
                    </button>
                    <button
                      disabled={!planning}
                      onClick={() => saveOrder({ creatureId: selected, path, early: null, late: null })}
                    >
                      Clear selected phase
                    </button>
                    <button
                      disabled={!planning || !savedOrder}
                      onClick={() => {
                        send({ type: 'clear', creatureId: selected });
                        setPath([]);
                      }}
                    >
                      Clear whole order
                    </button>
                    {savedOrder && (
                      <div aria-label="Saved order">
                        <p>Early: {describe(savedOrder.early)}</p>
                        <p>Late: {describe(savedOrder.late)}</p>
                        <p>Saved movement: {savedOrder.path.length} steps</p>
                      </div>
                    )}
                    {unit && (
                      <TacticalOrders
                        key={`${unit.id}-${view.turn}`}
                        view={view}
                        unit={unit}
                        path={path}
                        q={q}
                        r={r}
                        timing={timing}
                        onSave={order => send({ type: 'order', order })}
                      />
                    )}
                    <p>{view.orders.find(o => o.creatureId === selected) ? 'Draft saved' : 'No saved draft'}</p>
                    {unit && (
                      <SpellEditor
                        key={unit.id}
                        view={view}
                        unit={unit}
                        q={q}
                        r={r}
                        path={path}
                        timing={timing}
                        onSave={saveOrder}
                      />
                    )}
                  </aside>
                </details>
              </aside>
            )}
          </div>
        </>
      )}
    </section>
  );
}
