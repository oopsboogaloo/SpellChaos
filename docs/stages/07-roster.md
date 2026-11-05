# Stage 7 — in progress

Stages 1–6 were merged into `main` at `b66f5b0`. Stage 7 begins from that
reviewed tree. This first checkpoint records all 56 approved creature blueprints
and centralises the six previously enabled profiles. It does not complete Stage 7
or enable the remaining 50 creatures in matches.

## Content checkpoint

`packages/content/src/roster.ts` contains the seven eight-level MVP families,
with explicit statistics, HP, ordinary attacks, multiattacks, critical chances,
defences, caster pools/caps/lists, immunities, corpse eligibility and reanimation
attack selection. Special actions and traits that need new execution support have
named, numeric ability requirements. `roster-abilities.ts` describes each such
requirement and provides a closed TypeScript identifier set.

The catalogue is portable data and returns independent copies. It is not an
ability dispatcher. `summons.ts` retains an explicit availability gate: only the
same three familiars and three swarms from Stage 6 are currently summonable.
Existing flight-capable familiars retain Stage 6's fixed-height behaviour;
take-off, landing and mount controls still belong to the work below.

The existing six creatures were compared against the catalogue before switching
their factory to the shared definitions. Their normalised production data match.
No authoritative state field, schema, rules version or runtime content semantics
change in this checkpoint. Thus no save migration is required. Catalogue JSON
round trips and current-schema creature parsing are checked; these are **not**
claims that pending abilities already survive mid-resolution restoration.

## Automated evidence

`tests/roster.test.ts` checks all 56 entries against independent numeric tables,
including every ordinary attack/shot, and verifies seven complete families,
unique names, fresh copies, invalid-level handling, portable core data, compound
attacks, caster restrictions, D01–D08 content choices, undead/corpse exceptions,
reanimation attack stripping, siege ranges/components and immobility. Existing
headless, browser and scenario suites remain mandatory because the enabled
summon factory now reads the catalogue.

## Remaining Stage 7 work

1. Add versioned runtime ability definitions and pending state, with frozen
   schema-10 validators, explicit migration and atomic continuation fixtures.
2. Implement movement/attack passives: Pounce, Dive, Ambush, Aim, Brace, Rally,
   cover, close-range penalties, selectable arrows, Bristles, Shove and drain.
3. Implement explicit special actions and their previews/validation: Fear, gaze,
   Spores, Command, Root Network, Marked Quarry, Wail, Scorch and tail sweep.
4. Complete flight transitions, mounts, dismount/death placement, Blink, Drag,
   Shade passage and detection. Preserve hidden information and illusion rules.
5. Implement cooldowns, independent breath types, siege reload/penetration,
   arcing/structure damage, False King and constriction timing.
6. Exercise each interaction with illusion provenance, reanimation exclusions,
   phase ordering, failure cases and restore/continue tests; enable profiles only
   once their required mechanics are covered. Finish the combined roster scenario.

The approved D01–D22 decisions remain the baseline. Object/weapon suitability
markers do not introduce potions, inventory or armour into MVP. Innate powers
inherit the specification's default cooldown unless a listed exception applies;
the runtime implementation must distinguish passive traits from actions.

Full playable UI, AI, release hardening and deployment remain later stages. The
verbatim specification source archive and full-source reconciliation are still
outstanding release gates; the existing condensed specification is not that archive.

Checkpoint verification: `pnpm check` passed 505 tests (including 66 roster checks),
`pnpm build` passed, all nine existing CLI scenarios passed, and Chromium passed
all 16 tests. The Wall integration fingerprint remains `fnv1a32-v1:7662cfca`.

Attack-trait checkpoint: `attack-traits.ts` now implements the deterministic
modifier calculation for Aim, Brace, Ambush, Rally and close-range disadvantage.
Seven focused tests cover boundaries, D08/D18, non-stacking and JSON context
restoration. This pure calculation is not yet connected to attack resolution:
phase-local action history and authoritative trait state must be added with the
next schema migration before these creatures can be enabled. This does not claim
mid-resolution save coverage for those pending fields.

Forced-movement prerequisite: the production relocation helper now records actual
movement in the existing serialised `moved` history, once per creature. This fixes
missing input for Aim and the existing Subdued movement/action restriction.
Invalid destinations leave state untouched; no-op relocation does not count as
movement. Three regression tests cover these cases and identical continuation
following snapshot restoration. No new schema field is introduced. Attack-trait
integration and phase-local action history remain pending.
