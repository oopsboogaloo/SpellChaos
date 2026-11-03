import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMatch, applyCommand } from '../../../packages/engine/src/index.js';
import { encodeSnapshot, restoreSnapshot } from '../../../packages/persistence/src/snapshot.js';
import './style.css';
import { CastingPreview } from './CastingPreview.js';
import { TurnPreview } from './TurnPreview.js';
import { GeometryPreview } from './GeometryPreview.js';

function App() {
  const [state, setState] = useState(() => createMatch('demo', ['human', 'ai'], 1));
  return <main>
    <p className="eyebrow">DEVELOPMENT BUILD · FOUNDATION</p>
    <h1>Spell Chaos</h1>
    <p>The first engine foundation is running in your browser. The game is under construction.</p>
    <section aria-label="Engine smoke test">
      <h2>Deterministic engine</h2>
      <p>Turn {state.turn} · {state.phase} · revision {state.revision}</p>
      <button disabled={state.players[0]!.locked} onClick={() => setState(applyCommand(state, {
        matchId: 'demo', playerId: 'human', turn: 1, expectedRevision: state.revision,
        commandId: 'demo-lock', type: 'LockTurn',
      }).state)}>Lock demo order</button>
      <button onClick={() => setState(restoreSnapshot(encodeSnapshot(state)))}>Save and restore demo</button>
      <button onClick={() => setState(createMatch('demo', ['human', 'ai'], 1))}>Reset</button>
    </section>
    <TurnPreview />
    <CastingPreview />
    <GeometryPreview />
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
