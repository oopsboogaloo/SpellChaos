import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createMatch } from '../dist/engine/src/index.js';
import {
  createMatchSession,
  runMatch,
  restoreMatchSession,
  encodeMatchSession,
  matchReport,
} from '../dist/ai/src/session.js';
const args = process.argv.slice(2),
  value = (name, fallback) => {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
  };
const players = String(value('--players', '2,4')).split(',').map(Number),
  seeds = String(value('--seeds', '123')).split(',').map(Number);
const maxTurns = Number(value('--max-turns', '60')),
  maxPlanningWork = Number(value('--max-work', '10000000')),
  difficulty = value('--difficulty', 'standard');
if (
  players.some(n => !Number.isInteger(n) || n < 2 || n > 8) ||
  seeds.some(n => !Number.isInteger(n) || n < 1 || n > 0xffffffff)
)
  throw Error('INVALID_MATCH_ARGS');
const results = [];
if (args.includes('--resume')) {
  const initial = restoreMatchSession(readFileSync(String(value('--resume', '')), 'utf8')),
    session = runMatch(initial);
  results.push(matchReport(session));
  if (args.includes('--save')) writeFileSync(String(value('--save', '')), encodeMatchSession(session) + '\n');
} else
  for (const n of players)
    for (const seed of seeds) {
      const initial = createMatch(
        `ai-${n}-${seed}`,
        Array.from({ length: n }, (_, i) => `p${i}`),
        seed,
      );
      const session = runMatch(createMatchSession(initial, { maxTurns, maxPlanningWork, difficulty }));
      results.push({ seed, players: n, ...matchReport(session) });
      if (args.includes('--progress'))
        process.stderr.write(`players=${n} seed=${seed} outcome=${session.outcome?.type} turn=${session.state.turn}\n`);
      if (session.outcome?.type === 'failure') {
        const directory = resolve(String(value('--capture-dir', '/tmp/spellchaos-ai-failures')));
        mkdirSync(directory, { recursive: true });
        writeFileSync(join(directory, `private-ai-${n}-${seed}.json`), encodeMatchSession(session) + '\n');
      }
      if (args.includes('--save') && players.length === 1 && seeds.length === 1)
        writeFileSync(String(value('--save', '')), encodeMatchSession(session) + '\n');
    }
const totals = { wins: 0, draws: 0, timeouts: 0, failures: 0 };
for (const r of results) {
  if (r.outcome?.type === 'winner') totals.wins++;
  else if (r.outcome?.type === 'draw') totals.draws++;
  else if (r.outcome?.type === 'timeout') totals.timeouts++;
  else totals.failures++;
}
const report = { reportVersion: 1, node: process.version, command: 'node tools/run-ai.mjs', totals, results };
const text = JSON.stringify(report, null, 2) + '\n';
if (args.includes('--output')) writeFileSync(String(value('--output', '')), text);
process.stdout.write(text);
if (totals.failures) process.exitCode = 1;
