# Spell Chaos

Browser wizard combat, built through a reviewed specification and staged plan.

## Project documents

- [Approved design](docs/DESIGN.md)
- [Implementation plan](docs/PLAN.md)
- [Condensed specification](docs/SPECIFICATION.md)
- [Foundation progress](docs/stages/01-foundation.md)
- [Geometry and occupancy](docs/stages/02-geometry.md)
- [Orders and phase resolution](docs/stages/03-orders.md)
- [Combat and lifecycle](docs/stages/04-combat.md)
- [Casting, mana and control](docs/stages/05-casting.md)

## Development

Use Node 24.19.0 and pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
pnpm dev
```

The current increment is a TypeScript foundation and development browser shell,
not a playable game.
The engine has no dependency on browser input, rendering or wall-clock time.
Editable movement orders, Dash, Defend, Total Defence and phase stepping are
implemented. Run `node tools/run-turn.mjs` after building for a headless turn
that verifies save/restore at each step. Combat, Guard, conditions and death now
resolve headlessly; `node tools/run-combat.mjs` demonstrates them. Spellcasting,
mana, alignment and control now resolve in the same engine. Run
`node tools/run-casting.mjs` to verify remote casting across turns. The full
roster and remaining illusion/environment spells are still staged work.

## Saves

Current saves use schema 4 / rules `casting-0.1` / content `casting-integration-0.1`.
Foundation schema-1, orders schema-2 and combat schema-3 have explicit migration functions; normal
loading never silently migrates or changes the rules version.
Unknown versions fail explicitly. This development format will not be silently
interpreted as a future complete game save. All state is JSON-safe and validated
before use. Snapshot history is checked against player locks and revisions.

## Verification

Vitest covers seeded random vectors, bounded draws, command validation and
idempotency, immutable transitions, view filtering, snapshot corruption, and
identical continuation after fresh decoding. Generated RNG tests use seed 12345.
GitHub Actions repeats typechecking, tests and build on pushes and pull requests.

No deployment is configured yet. Full content, illusion/environment spells, responsive UI,
full browser workflow tests and release gates remain in the plan.
