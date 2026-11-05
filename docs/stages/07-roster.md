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

## Runtime attack-trait integration

Schema 11 (`roster-0.1`, `attack-traits-0.1`) adds explicit creature attack traits
and unique `actedThisPhase` identifiers. Combat now applies Aim, Brace, Ambush,
Rally and close-range disadvantage. Actual action starts/completions record phase
activity; phase transitions clear it independently of turn-wide action history.
Rally excludes the attacker, enemies, inactive sources and different heights,
and multiple eligible sources still grant only one point. Brace adds damage
before criticals and defences. Reanimation retains ordinary attack traits but
removes Rally's command aura. Illusions retain the copied combat traits.

Adder, Hobgoblin, Bowman and Longbowman are now enabled, bringing the runtime
roster to ten profiles. Goblin king remains gated pending Command, although its
Rally aura can be tested in scripted scenarios. Other creature abilities and
flight/mount/cooldown work remain incomplete.

Schema-10 validators and content-availability checks are frozen. The explicit
`migrateWallSnapshot` migration supplies neutral traits without inferring new
abilities from old species names. Earlier migration entry points also produce
schema 11. Old fixtures remain unchanged and unsupported raw snapshots are
rejected. New permanent fixtures capture pending Guard and Ambush attacks.

`tests/attack-trait-integration.test.ts` verifies production damage, authoritative
context, phase resets, aura eligibility, malformed state, command-aura stripping
and exact event/state continuation from the new fixtures. Full headless validation
passes 522 tests and the production build passes.

Final integration verification also passed all 16 Chromium tests and all nine CLI
scenarios. The Wall scenario retains wizard HP 4 and crystal HP 11; its fingerprint
is now `fnv1a32-v1:9d33ec62` because the versioned state includes the new fields.

## Hydra and sabre-toothed tiger

Two more approved profiles are enabled (12 total). Their required mechanics use
existing production paths, now covered with profile-specific regression tests:
Hydra's three independently targeted bites form one action, invalid subtargets
are wasted, each pending hit survives restore, regeneration restores 3 HP even
from incapacitation, fire/acid vulnerability suppresses regeneration for that
turn, death prevents recovery, and reanimation strips regeneration. Tiger retains
15% Crit and cold resistance; its bite applies persistent Bleeding through the
secondary-effect resistance roll. An illusory tiger's Bleeding and both attack
and ongoing damage reverse with their source.

The schema remains 11 because no fields changed. Content is now
`attack-traits-0.2`. `legacy-content-traits-v1.ts` freezes the prior content
validator/availability; `migrateAttackTraitContent` explicitly upgrades older
schema-11 saves without changing their creatures, RNG, phase activity or pending
attacks. The two original trait fixtures remain unchanged and are now exercised
through that migration. Direct loading of the old content version is rejected.

The remaining 44 profiles stay gated. Special actions, flight transitions,
mounts, cooldowns and the other previously listed Stage 7 work remain open.

Verification: 528 headless tests and type checking pass. The production build,
16 Chromium tests and all nine CLI scenarios pass. Wall outcomes remain HP 4/11;
the content-version change gives fingerprint `fnv1a32-v1:de43dea3`.

## Control creatures and creature spellcasters

Grasping vine, Spectre, Goblin shaman, Ancient treant and The Pale Monarch are now
enabled: 17 profiles total. Ten new checks exercise the production mechanics
against these profiles: two independent equal-size grapples at reach two, Escape
releasing one hold, larger-target rejection, Wither only after positive damage,
reversible illusion provenance, physical immunity/light vulnerability, incorporeal
transit versus Energy and occupied endpoints, and the three caster profiles' own
mana pools, level caps, illusion exclusions and pending-cast continuation.

No replacement mechanics were introduced; these profiles use the tested existing
grapple, condition, defence, movement and casting implementations. The remaining
39 profiles stay gated while their missing interactions are implemented.

Content is `attack-traits-0.3`, still schema 11. The previous content-v2 validator
and summon availability are frozen in `legacy-content-traits-v2.ts`.
`migrateAttackTraitContent` now accepts either supported old content version,
validates it first, and preserves all stored creature and pending-effect data.
A permanent v2 Guard fixture (same state as the earlier Guard fixture, labelled
with the supported v2 content version) checks migration, rejection of unknown
versions, and identical continued attacks after loading.

Verification: 538 headless tests, type checking, production build, 16 Chromium
tests and all nine CLI scenarios pass. Stage 7 is still incomplete: special
active abilities, flight transitions, mounts, cooldowns and other listed work
remain outstanding.

## Bristles and life drain

Thorn bush and Wraith are now enabled (19 total). Creature state has bounded
`bristles` and `lifeDrain` amounts. A positive damaging melee hit triggers one
physical Bristles retaliation, even if the hit is lethal to the defender. This
is damage, not a new attack, so it cannot recursively trigger Bristles. Retaliation
uses the defender as its source and contributes to the original action's damage
aggregation for concentration. Incapacitating the attacker stops later compound
attack hits.

Wraith heals 2 after damaging a living real target, including living plants but
excluding undead, constructs and illusions. Zero damage gives no healing. Healing
is capped at maximum HP. Illusory Wraith can heal only itself; its attack damage
remains reversible. Its physical immunity prevents ordinary Bristles damage.

Timing decision for these on-hit effects: apply original damage, then life drain,
then Bristles, then existing secondary effects and death cleanup. Retaliation
never starts another attack or grants an action. All of this occurs within the
existing atomic hit step, so there is no partially applied hit to serialise.

Schema 12 / rules `roster-0.2` / content `retaliation-drain-0.1` stores both traits.
The schema-11 content-v3 validator is frozen in `legacy-v11.ts`; supported older
migrations supply zero-valued on-hit traits instead of inferring new powers from
species. Prior fixtures remain untouched. Two new schema-12 fixtures capture
pending retaliation and life-drain attacks. A derived content-v3 Guard fixture
checks old data and RNG preservation through migration.

Verification: 554 headless tests, type checking, production build and 16 Chromium
tests pass. Tests cover trigger boundaries, lethal retaliation, no loops,
compound-attack interruption, real/illusory targets, immunity, healing caps,
provenance reversal, malformed state, migration and exact per-hit continuation.
The remaining 37 profiles and earlier listed Stage 7 tasks are still outstanding.
All nine existing CLI scenarios also pass with the new state version.
