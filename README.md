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
- [Roster implementation and checkpoint evidence](docs/stages/07-roster.md)
- [Fair AI and unattended matches](docs/stages/08-ai.md)

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
`node tools/run-casting.mjs` to verify remote casting across turns. All 40 profiles in the five-family MVP roster now have their engine abilities
implemented; Goblin/Dragon remain deferred with their historical content preserved. Reanimate
now resolves against eligible corpses at levels 1–8; run
`node tools/run-reanimation.mjs` for zombie/skeleton replay checks. Stage 6 mechanics are implemented, including all eight Wall materials.
Stage 8 adds view-only wizard AI, per-creature unbound behavior and portable
unattended matches. The complete playable browser UI is Stage 9; this remains a
development preview.
Snake Swarm, Greater Snake Swarm and Strangling Grove now support shrinking,
legal regrowth, coverage restraint and per-enemy attacks. Run
`node tools/run-swarms.mjs` for a movement/coverage/attack replay.

## Saves

Current saves use schema 27 / rules `autonomy-0.1` / content `gryphon-shepherd-0.1`.
Historical schemas 1–26 retain frozen validators and explicit migration functions;
`migrateRosterSnapshot` preserves schema-26 committed work without generating
autonomous plans mid-resolution. Older migrations never infer new creature powers. Normal
loading never silently migrates or changes the rules version.
Unknown versions fail explicitly. This development format will not be silently
interpreted as a future complete game save. All state is JSON-safe and validated
before use. Snapshot history is checked against player locks and revisions.

## Verification

Vitest covers seeded random vectors, bounded draws, command validation and
idempotency, immutable transitions, view filtering, snapshot corruption, and
identical continuation after fresh decoding. Generated RNG tests use seed 12345.
GitHub Actions repeats typechecking, tests and build on pushes and pull requests.

No deployment is configured yet. The responsive playable UI, complete browser
workflows and acceptance/performance/soak hardening remain in the plan.
The verbatim original specification archive remains a release gate; the linked
condensed specification is not that archive. The permanent full-roster replay in
`tests/fixtures/mounts-v26-full-roster.json` exercises a scripted headless turn
with all 40 MVP profiles, not an AI match or a finished game.


Schema 4 uses `migrateCastingSnapshot` to upgrade explicitly. Its frozen validators
and fixtures are retained. The migration preserves random state, orders, pending
casts and existing combat data while adding body attack selection and restoration
history; it does not redraw spellbooks. An explicit body attack list excludes
non-body powers from reanimation (`null` retains all basic attacks; `[]` retains
none). Full-roster body capability annotations are recorded in the Stage 7 implementation.


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
cover planning, Quick casting and an active cloud. Stage 7 now covers the retained roster vision abilities;
the playable browser interface remains a later stage.

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

## Unattended matches

After building, run `node tools/run-ai.mjs` for seeded 2/4-player matches. A larger
smoke run is reproducible with:

```sh
node tools/run-ai.mjs --players 2,4,8 --seeds 123,456 --max-turns 60 --output /tmp/ai-report.json
node tools/run-ai.mjs --players 3,5,6,7 --seeds 123 --max-turns 60 --output /tmp/ai-extra-report.json
```

The [Stage 8 smoke report](docs/reports/stage-08-smoke.json) records eight engine
wins, two harness timeouts and no failures. Timeouts remain separate from draws.
AI difficulty (`--difficulty easy|standard|hard`) changes search/scoring only.
`--save /path/session.json` exports a single match's **private** session, including
hidden engine state and command history; `--resume /path/session.json` restores its
recorded policy version, limits and progress. Failures save private diagnostics to
`/tmp/spellchaos-ai-failures` by default (`--capture-dir` overrides the directory).

The policy takes only `projectView` observations plus an explicit AI seed. It
validates hypotheses from those observations, and rejected uncertain proposals
receive one fixed fallback rather than probing hidden information. The match
harness preserves full planning batches and every native atomic resolution step.
