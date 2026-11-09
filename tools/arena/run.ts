/** Usage: tsx tools/arena/run.ts <shard> <shards> <fightsPerPair> <out.jsonl> */
import { appendFileSync, writeFileSync } from 'node:fs';
import { fight, roster } from './fight.js';

const [shard, shards, perPair, out] = [
  Number(process.argv[2]),
  Number(process.argv[3]),
  Number(process.argv[4]),
  process.argv[5]!,
];
const list = roster();
writeFileSync(out, '');
let pair = 0;
for (let i = 0; i < list.length; i++)
  for (let j = i + 1; j < list.length; j++, pair++) {
    if (pair % shards !== shard) continue;
    const lines: string[] = [];
    for (let k = 0; k < perPair; k++) {
      // Alternate who starts on the left so position does not favour either side.
      const [a, b] = k % 2 ? [list[j]!, list[i]!] : [list[i]!, list[j]!];
      try {
        lines.push(JSON.stringify(fight(a, b, 1000 * pair + k + 1)));
      } catch (e) {
        lines.push(JSON.stringify({ a: a.key, b: b.key, error: (e as Error).message }));
      }
    }
    appendFileSync(out, lines.join('\n') + '\n');
  }
