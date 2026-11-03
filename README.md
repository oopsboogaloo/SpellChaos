# Spell Chaos

Browser wizard combat, built through a reviewed specification and staged plan.

## Project documents

- [Approved design](docs/DESIGN.md)
- [Implementation plan](docs/PLAN.md)
- [Condensed specification](docs/SPECIFICATION.md)
- [Foundation progress](docs/stages/01-foundation.md)
- [Geometry and occupancy](docs/stages/02-geometry.md)
- [Orders and phase resolution](docs/stages/03-orders.md)

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
that verifies save/restore at each step. Combat and spells remain later stages.

## Saves

Current saves use schema 2 / rules `orders-0.1` / content `wizard-0.1`.
The foundation schema-1 fixture has an explicit migration function; normal
loading never silently migrates or changes the rules version.
Unknown versions fail explicitly. This development format will not be silently
interpreted as a future complete game save. All state is JSON-safe and validated
before use. Snapshot history is checked against player locks and revisions.

## Verification

Vitest covers seeded random vectors, bounded draws, command validation and
idempotency, immutable transitions, view filtering, snapshot corruption, and
identical continuation after fresh decoding. Generated RNG tests use seed 12345.
GitHub Actions repeats typechecking, tests and build on pushes and pull requests.

No deployment is configured yet. Complete combat, content, responsive UI,
full browser workflow tests and release gates remain in the plan.
