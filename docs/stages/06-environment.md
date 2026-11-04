# Stage 6 — in progress

Current checkpoint: Reanimate, swarm lifecycle/combat and physical wall-layout geometry. 4 November 2026.

The initial reanimation checkpoint below is historical; the swarm increment and
latest verification are recorded at the end of this report.
This is a tested implementation increment, **not Stage 6 completion or the playable MVP**.
Base: Stage 5 (`8ada790`); working branch: `build/stage-06-environment`.

## Implemented behaviour

Reanimate is enabled at levels 1–8. Orders target stable corpse IDs and use the
existing Slow casting, reservation, payment, alignment, familiar origin and
concentration rules. Eligibility and the entire footprint are checked during
planning and again at completion. A blocked or already-consumed corpse fails
without relocation; casting that has begun still costs its full mana.

The result is a bound zombie or skeleton, with binding level equal to spell level
(D22) and original creature-equivalent level retained. Zombies halve positive
Move and Dex, rounding down to at least one; zero Move remains zero. Skeletons
retain those statistics. Existing undead physical defences and condition
immunities apply. Body attacks, reach, current wing-flight state and body grapples
are retained. Poison/disease production, familiar benefits, spellcasting, mana,
regeneration and escape traits are removed. An explicit attack allowlist keeps
non-body powers out; the Dragonet's Spark is excluded. Full-roster capability
annotations and take-off/landing remain Stage 7 work.

The original corpse, original creature and new servant record the spent
restoration opportunity. The servant's later corpse cannot reset it. Failed or
interrupted casts do not spend the opportunity. Reanimated servants collapse on
controller death. Wizard corpses and excluded body categories cannot be raised.

Physical wall geometry identifies corners by three incident hexes. It validates
connected segments, rejects duplicates and over-budget networks, and checks
existing walls and footprint intersections. Sharing a hex is insufficient:
opposite edges of that hex do not touch. Perimeter extraction works without
floating-point coordinates, including board-border corners. This primitive does
**not** enable Wall casting or the deferred Circle Wall spell.

## Narrow implementation rulings

- S6-R1: Reanimated bodies start at Con × Size HP, at the corpse location, and
  first act on the following turn. They get no immediate movement or reactions.
- S6-R2: Retain original Int and listed defences, then apply the existing undead
  rules. Retain body pack/grapple capabilities; do not copy Double Action or
  unique powers automatically. Full-roster exceptions require explicit data.
- S6-R3: Body attack metadata is nullable: `null` means all listed basic attacks;
  an explicit list restricts them, and `[]` retains none. No replacement attack
  is invented for a body lacking a usable attack. Existing scenario bodies use
  the default; approved Dragonet content explicitly excludes Spark.
- S6-R4: Consumed corpses remain as nonblocking historical records and are
  marked unavailable. Cumulative fire/acid exposure carries into the servant,
  preserving skeletal state if it dies again.
- S6-R5: Simultaneous competing reanimations follow normal casting order. The
  first success consumes the opportunity; later completions fail normally.

These are routine implementation definitions under the owner's delegated
decision authority, not changes to locked creature statistics.

## Save compatibility

Schema 5 / rules `environment-0.1` / content `reanimation-integration-0.1`.
Frozen schema-4 state, spell and combat validators retain their original content
availability checks. `migrateCastingSnapshot` explicitly upgrades v4, preserving
RNG, orders, casts and combat data; it does not redraw spellbooks. Plain loading
rejects old versions. Earlier explicit migration entry points remain supported.

New immutable v5 fixtures cover planning, a pending late Slow cast and a consumed
corpse after successful reanimation. Existing v4 fixtures remain unchanged and
are exercised through migration. Corpse references and body attack identifiers
are validated before replacing a running game. Player views expose corpse
location, size, skeletal state and spent opportunity, without exact HP or exposure.

## Verification

- `pnpm check`: typechecking and **235 headless tests passed**.
- `pnpm build`: passed.
- `pnpm test:coverage`: all 235 passed; engine 100% lines / 94.86% branches.
  Reanimation and wall-layout modules each reached 100% lines and branches.
  Whole-repository coverage is 87.19% lines / 84.88% branches; browser and CLI
  execution is separate from Vitest instrumentation. This is not full-game coverage.
- `pnpm test:browser`: **11 Chromium tests passed**, including Node/browser
  equivalence for zombie and skeleton casts with restoration at every step.
- All four CLI scenarios passed. `node tools/run-reanimation.mjs` runs each
  body type through 44 atomic steps over two turns, comparing uninterrupted and
  restored continuation at each boundary.
- Generated continuation cases use seed 6001 (25 cases); translated wall networks
  use seed 6002 (100 cases). Permanent fixtures and explicit expected outcomes
  supplement generated cases.

GitHub Actions runs typechecking, the headless suite, production build, all four
CLI scenarios and Chromium tests. Exact run status is reported with the PR.
Traceability: [environment checks](../traceability/environment-checks.json).

## Remaining work

Stage 6 remains open: reversible illusion damage/conditions and hidden-information
handling; all eight Wall casting/material
interactions, structure/corpse attack targeting, Darkness and Tangleweed; combined
environment replays. The new wall functions are prerequisites for that work.
The browser still exposes development previews, not a complete game UI.

The full verbatim source archive remains outstanding; `SPECIFICATION.md` is a
condensed register. That limitation is unchanged and remains a release gate.
No merge or deployment is performed by this checkpoint.


## Swarm increment — 4 November 2026

The approved Snake Swarm (Serpent 3), Greater Snake Swarm (Serpent 4) and
Strangling Grove (Plant 6) profiles are now available. Their numeric profiles,
poison potency and defences follow the MVP tables. These join the three existing
familiar profiles; they do not stand in for the rest of the 56-profile roster.

Damage shrinks Size immediately below half/quarter original HP, keeping the
centre and original maximum HP fixed. Healing restores HP immediately and grows
only to a legal footprint. Turn start retries deferred growth. Coverage restraint
is derived from current footprints, height and Size, including allied creatures,
constructs and smaller swarms. Movement, death and shrinking release it without
stale condition records. Swarms at zero HP disperse, cannot heal during the
pending cleanup boundary and leave no corpse.

Swarm attacks enumerate covered/adjacent enemies once in stable ID order, use
separate hit/critical/secondary-effect rolls and preserve their victim cursor and
per-action damage totals across snapshots. Range and allegiance are rechecked
before each hit. They respect walls and height. Ground swarms cannot cross solid
walls; flying swarms can cross ordinary walls but not Energy. Swarms intercept
ordinary projectiles. Existing damage multipliers apply per component, with D07
preserving the Grove's explicit major fire vulnerability without double stacking.

Additional implementation rulings:

- S6-R6: An ordinary swarm attack is melee per victim, not an arcing/resistance
  area attack. Its several bite/root rolls do not implicitly grant the area
  damage property. It incurs no threatened-ranged penalty.
- S6-R7: Swarm Guard reacts only against the entering creature, once per enemy;
  it does not reattack all bystanders each time a new enemy enters range.
- S6-R8: Escape can contest actual holds and condition restraints. It cannot
  remove the continuous restraint of still being covered by a larger swarm.
- S6-R9: Initial summoning still requires an empty footprint, as specified for
  summoning. Swarm overlap is permitted during movement and legal regrowth.
- S6-R10: Candidate victims are snapshotted at the beginning of each attack
  strike; newly arriving targets do not join a partially resolved strike.

Schema 6 / rules `environment-0.2` / content `swarm-integration-0.1`.
`originalSize` is explicit portable state. The existing pending-attack cursor
also stores swarm victim continuation. Schema-5 validators and content eligibility
are frozen; `migrateEnvironmentSnapshot` upgrades explicitly without consuming
RNG. Earlier migrations still target the current schema. Player views report
current restraint without exposing exact enemy HP.

Four immutable fixtures cover planning, movement coverage, a partially resolved
swarm attack and blocked regrowth. Generated continuation tests use seed 6003
(30 cases); generated damage/healing invariants use seed 6004 (60 cases). The
headless CLI checks 37 atomic steps, proving a swarm can cover a slower creature
and prevent its planned escape before a late attack. Node and Chromium compare
its complete state, event stream and permitted view.

Latest verification: 282 headless tests and 12 Chromium tests passed; typechecking,
production build and all five CLI scenarios passed. GitHub Actions now includes
`node tools/run-swarms.mjs`. The PR records the exact tested GitHub commit/run.
Stage 6 remains in progress: illusions and the remaining environment spells are
not enabled. No merge or deployment is part of this increment.
