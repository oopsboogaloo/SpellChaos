import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('keeps production engine free from browser, UI and ambient time/randomness', () => {
  const root = resolve('packages/engine/src');
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.ts')) continue;
    const source = readFileSync(resolve(root, name), 'utf8');
    expect(source, name).not.toMatch(/\b(?:window|document|requestAnimationFrame|setTimeout)\s*[.(]/);
    expect(source, name).not.toMatch(/\b(?:Date\.now|Math\.random|performance\.now)\s*\(/);
    expect(source, name).not.toMatch(/from\s+['"].*(?:react|apps\/web|node:)/);
  }
});
