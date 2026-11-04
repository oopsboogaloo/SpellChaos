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
roster and creature-specific abilities are still staged work. Reanimate
now resolves against eligible corpses at levels 1–8; run
`node tools/run-reanimation.mjs` for zombie/skeleton replay checks. Stage 6 mechanics are implemented, including all eight Wall materials.
The game remains a development preview; full roster abilities and the playable UI are later stages.
Snake Swarm, Greater Snake Swarm and Strangling Grove now support shrinking,
legal regrowth, coverage restraint and per-enemy attacks. Run
`node tools/run-swarms.mjs` for a movement/coverage/attack replay.

## Saves

Current saves use schema 10 / rules `environment-0.6` / content `wall-integration-0.1`.
Foundation schema-1, orders schema-2, combat schema-3, casting schema-4, environment schema-5 swarm schema-6 illusion schema-7 Darkness schema-8 and Tangleweed schema-9 have explicit migration functions; normal
loading never silently migrates or changes the rules version.
Unknown versions fail explicitly. This development format will not be silently
interpreted as a future complete game save. All state is JSON-safe and validated
before use. Snapshot history is checked against player locks and revisions.

## Verification

Vitest covers seeded random vectors, bounded draws, command validation and
idempotency, immutable transitions, view filtering, snapshot corruption, and
identical continuation after fresh decoding. Generated RNG tests use seed 12345.
GitHub Actions repeats typechecking, tests and build on pushes and pull requests.

No deployment is configured yet. Full content, remaining environment spells, responsive UI,
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


Illusion summons, Disbelief and damage reversal now run in the engine. Run
`node tools/run-illusions.mjs` to verify survivor restoration and permanent shock
deaths. Damage history, source-tagged conditions, creator identity and private
illusion knowledge are portable state. Schema 6 upgrades explicitly through
`migrateSwarmSnapshot`; historical wounds are a real baseline because that version
did not enable illusion casting. Schema-6 fixtures and validators remain frozen.
Player events omit authoritative sequence numbers to avoid revealing private
notifications through gaps; their array order is the permitted playback order.
Wall casting, material hazards and direct structural targeting are now implemented.

### Darkness checkpoint

Darkness now casts at all eight levels, blocks sight into/through its area,
allows adjacent attacks with disadvantage, and expires or ends on caster death.
Owner views retain their units; hidden enemy occupants and event identities are
filtered. Event audiences are captured at emission, before later expiry.
Run `node tools/run-darkness.mjs` after building for the saved-turn replay.
Schema 7 upgrades explicitly through `migrateIllusionSnapshot`; it adds no clouds
and preserves RNG, wounds and pending work. Three immutable schema-8 fixtures
cover planning, Quick casting and an active cloud. Full roster vision abilities
and the playable browser interface remain later stages.

### Tangleweed checkpoint

All eight Tangleweed levels support connected placement, Slow completion,
terrain-adjusted movement, physical restraint and Escape, expiry and caster-death
cleanup. Each hex has its own HP. Ground projectiles/bolts and area attacks can
destroy weed; illusions cannot. Melee structural targeting is now included in the Wall
checkpoint. Owners receive the existing permitted view of restrained creatures.
Run `node tools/run-tangleweed.mjs` after building for the combined replay.
Schema 8 upgrades explicitly through `migrateDarknessSnapshot`; prior movement
steps become already-spent movement points. Five immutable schema-9 fixtures
exercise planning, casting, paid movement, a hold and a pending attack.

### Wall and environment integration checkpoint

Wall supports all eight materials, connected edge layouts, material-specific
alignment, Slow casting, footprint revalidation, destruction and caster-death
cleanup. Hazard crossings respect flight, damage defences, undead healing and a
once-per-network limit. Structural attacks and bolts can select wall segments or
weed hexes, with normal interception by creatures. Fire Bolt ignites wood;
refreshing Burning preserves already-due ticks on both wood and creatures.

Run `node tools/run-walls.mjs` after building to replay illusion damage reversal,
fire crossing, weed movement and a late shot intercepted by a new crystal wall.
Schema 9 upgrades explicitly through `migrateTangleweedSnapshot`. Five immutable
schema-10 fixtures cover planning, casting, crossing, interception and resolution.
Destroyed wall IDs preserve pending orders after their target disappears.
Stage 6 mechanics are ready for review; the verbatim specification archive and
full-source acceptance audit remain outstanding, alongside later MVP stages.
