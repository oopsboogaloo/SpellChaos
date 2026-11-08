import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

// #32: packages form layers; each may import only the packages listed for it, so the
// dependency graph between packages stays acyclic. Update this table deliberately.
const ALLOWED: Record<string, string[]> = {
  geometry: [],
  domain: ['geometry'],
  content: ['domain', 'geometry'],
  persistence: ['domain', 'geometry', 'content'],
  engine: ['domain', 'geometry', 'content', 'persistence'],
  views: ['domain', 'geometry', 'content', 'engine'],
  ai: ['domain', 'geometry', 'content', 'persistence', 'engine', 'views'],
  scenario: ['domain', 'geometry', 'content', 'persistence', 'engine', 'views', 'ai'],
};

it('every package is listed in the layering table', () => {
  expect(readdirSync('packages').sort()).toEqual(Object.keys(ALLOWED).sort());
});

it('packages only import packages below them', () => {
  const violations: string[] = [];
  for (const [pkg, allowed] of Object.entries(ALLOWED)) {
    for (const file of readdirSync(`packages/${pkg}/src`).filter(f => f.endsWith('.ts'))) {
      const source = readFileSync(`packages/${pkg}/src/${file}`, 'utf8');
      for (const [, target] of source.matchAll(/from\s+['"]\.\.\/\.\.\/([a-z]+)\//g))
        if (target !== pkg && !allowed.includes(target!)) violations.push(`${pkg}/${file} -> ${target}`);
    }
  }
  expect(violations).toEqual([]);
});
