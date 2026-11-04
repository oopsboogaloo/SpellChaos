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
roster and remaining illusion/environment spells are still staged work. Reanimate
now resolves against eligible corpses at levels 1–8; run
`node tools/run-reanimation.mjs` for zombie/skeleton replay checks. Stage 6 remains
in progress; wall layout geometry is available but Wall casting is not enabled.
Snake Swarm, Greater Snake Swarm and Strangling Grove now support shrinking,
legal regrowth, coverage restraint and per-enemy attacks. Run
`node tools/run-swarms.mjs` for a movement/coverage/attack replay.

## Saves

Current saves use schema 6 / rules `environment-0.2` / content `swarm-integration-0.1`.
Foundation schema-1, orders schema-2, combat schema-3 casting schema-4 and environment schema-5 have explicit migration functions; normal
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


Schema 4 uses `migrateCastingSnapshot` to upgrade explicitly. Its frozen validators
and fixtures are retained. The migration preserves random state, orders, pending
casts and existing combat data while adding body attack selection and restoration
history; it does not redraw spellbooks. An explicit body attack list excludes
non-body powers from reanimation (`null` retains all basic attacks; `[]` retains
none). Full-roster body capability annotations are part of Stage 7.


Schema 5 uses `migrateEnvironmentSnapshot` to upgrade explicitly. Stored Size
becomes `originalSize`; swarm maximum HP remains fixed when current Size changes.
Published schema-5 fixtures and validators are frozen. Four schema-6 fixtures
cover planning, movement coverage, per-victim attack continuation and blocked
regrowth. Old saves are never silently loaded under current rules.
