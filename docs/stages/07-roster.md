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

## Marked Quarry

Dread revenant is enabled (20 profiles total). `MarkQuarry` is an explicit action
that selects or changes one visible living creature. It consumes the normal action
budget and grants +2 attack Skill only against that creature, including Guard.
The mark persists across turns until the quarry dies; cleanup clears it without
choosing a replacement. A selection that becomes invalid or hidden before
resolution wastes its action and preserves any previous valid mark.

D01 supplies the action cost and lifetime. Selection uses the controlling player's
permitted visibility and introduces no additional range limit (none was specified
for this selection ability); subsequent attacks still obey their normal range,
sight and interception rules. The mark does not reveal its target through Darkness.
Illusory revenants retain this combat ability without modifying target truth.

Schema 13 / rules `roster-0.3` / content `marked-quarry-0.1` adds explicit capability
and quarry identifiers plus the command variant. Validation rejects unsupported
planned use, self/unknown references and forged persistent marks. Schema 12 is
frozen in `legacy-v12.ts`. `migrateOnHitSnapshot` preserves existing data while
supplying no quarry capability or target. Earlier migrations also produce schema
13 without inferring new powers from old species names.

Three permanent fixtures cover planning, an active mark and a pending attack.
Eleven headless checks verify action cost, persistence, replacement, death cleanup,
actual hit probability, invalid/hidden targets, illusion use, malformed saves and
migration. Three Chromium checks compare full state, events and player views with
Node while restoring at each atomic boundary.

Verification: 565 headless tests, type checking, production build and all nine CLI
scenarios pass. The existing 16 browser checks and three new quarry checks pass
(19 total). The remaining 36 profiles and other listed Stage 7 mechanics remain
in progress; this is not a completed MVP or a deployment.

## Siege reload and area Guard

Catapult and Thunder Trebuchet are enabled (22 profiles total). Siege weapons
start loaded. A committed firing attempt consumes readiness; Reload is an explicit
action. Neither reload-after-fire nor fire-after-reload is allowed in the same
turn, including Double Action attempts. Readiness persists across turns and
restoration, so a normal cycle is fire turn 1, reload turn 2, fire turn 3.

Implementation timing choice: accepted firing attempts consume readiness even
if their target becomes invalid at resolution. Invalid planning commands do not.
Declaring Guard does not consume a shot; its qualifying reaction does. Area Guard
rechecks its triggering creature and locks the impact to the nearest occupied
hex, storing that ground point in the pending attack. Ordinary walls and creatures
do not intercept arcing shots; Energy blocks them. Areas damage each intersected
creature once, including allies, using resistance rather than hit/critical rolls.

Fixed a related area-resolution edge case: after a real blast has started, its
remaining victims still resolve if controller death unbinds its source. Otherwise
a blast killing both wizards could incorrectly stop after the first death.
Destroyed illusions stop their remaining attacks and retain damage reversal and
permanent shock-death rules. Tests distinguish the real draw from the illusory
winner case and restore between every atomic step.

Schema 14 / rules `roster-0.4` / content `siege-reload-0.1` stores loaded state and
last-fired/last-reloaded turns. Validation rejects contradictory histories and
unsupported Reload orders. Schema-13 state and combat validators are frozen;
`migrateQuarrySnapshot` adds no reload capability to existing creatures. Earlier
migration entry points still upgrade explicitly. Owner views expose independent
copies of reload state and quarry selection; opponent views omit those fields.

Four permanent fixtures cover firing, planning Reload, planning a subsequent shot
and a pending area Guard attack. Four Chromium cases match Node state, events and
permitted views while restoring at each boundary. Mixed fire/physical explosions
also verify that swarm fire/area vulnerability is applied only once per component.

Verification: 584 headless tests, type checking, production build, 23 Chromium
tests and all nine CLI scenarios pass. Wall outcomes remain HP 4/11; schema-14
fingerprint is `fnv1a32-v1:5e1eb7f0`. Ballista and Siege Catapult remain gated for
penetration and structural-damage rules respectively. The remaining 34 profiles
and other Stage 7 work are still outstanding.

## Siege Catapult structural damage

Siege Catapult (Archer 7) is enabled, bringing the roster to 23 of 56 profiles.
Its area attack deals 14 physical damage to each affected wall segment or
constructed Tangleweed cell, while creatures retain the listed 7 damage with
Dex resistance for half. Each structure is hit once even when both edge endpoints
are in the blast. Illusory siege engines still cannot damage structures.

The attack's optional `structureMultiplier: 2` is portable data, not a species-name
check. Existing attacks omit it and retain their previous damage. Schema 15 / rules
`roster-0.5` / content `siege-structures-0.1` makes the new attack interpretation
explicit. Frozen schema-14 validators and `migrateReloadSnapshot` preserve loaded
state, pending attacks and RNG without adding new abilities to existing creatures.
The frozen validator rejects the new field in old saves.

A permanent schema-15 mid-impact fixture verifies that restoring a committed shot
does not repeat structural damage. Chromium compares continuation, events and
player views with the production headless engine. Headless checks cover damage,
wall destruction, illusion restrictions, Tangleweed, malformed multiplier values,
and each of the four schema-14 reload/Guard fixtures. Ballista remains gated on
penetration; 33 profiles remain outside the enabled roster.

Verification: 596 headless tests, type checking, production build, 24 Chromium
tests and all nine CLI scenarios pass. Wall outcomes remain HP 4/11; schema-15
fingerprint is `fnv1a32-v1:fcd146cd`.

## Ballista penetration

Ballista (Archer 5) is enabled, bringing the roster to 24 of 56 profiles. Its bolt
follows the selected exact ray, attacks at most two creatures, and can intercept
allies. It skips the remaining occupied hexes of the first footprint before
selecting the next body. Each victim gets a separate hit and critical roll; an
initial miss does not stop penetration. The second strike uses 4 physical base
damage (ceil(7/2)) before target defences. Reload and ranged Guard use the same
committed projectile mechanics.

Implementation choices completing D05: the ray continues to the original weapon
range even when aimed at an empty nearer hex. It keeps target height and the
attacker's chosen boundary side throughout. A solid wall stops penetration; if
encountered before any creature it takes the ordinary bolt damage, while a wall
after the first body stops the follow-through without another structure strike.
Bodies overlapping the first footprint are skipped until the ray exits it.
These choices are explicit geometry rules, not new general projectile behaviour.

Schema 16 / rules `roster-0.6` / content `ballista-0.1` adds the optional portable
attack capability `penetration: 2`. The existing pending victim list and cursor
store the committed two-body path, so death or a first miss cannot change the
second target. A real committed bolt finishes if its controller dies; destroying
its illusion source ends the attack and retains the usual reversal rules.
Frozen schema-15 validators and `migrateSiegeSnapshot` preserve older attacks,
reload state, random state and pending impacts without granting penetration.

Tests cover footprint exclusion, range, walls, height, both ray sides, allies,
separate hit rolls, rounding before resistance, invalid orders at resolution,
Guard, illusions, mindless targets, controller death, malformed state and migration.
A permanent mid-shot fixture resumes immediately before the second strike and
matches Node/Chromium state, events and filtered views. The remaining 32 profiles
and other Stage 7 abilities are still outstanding.

Verification: 615 headless tests, type checking, production build, 25 Chromium
tests and all nine CLI scenarios pass. Wall outcomes remain HP 4/11; schema-16
fingerprint is `fnv1a32-v1:eeb12ce7`.

## Elven Archer arrow selection

Elven Archer (Archer 4) is enabled, bringing the roster to 25 of 56 profiles.
Its magic arrow (`basic`) and physical arrow (`physical-arrow`) are two explicit
projectile attacks with the approved Skill 7, damage 3, range 9 and default Crit 5%.
Orders and Guard select an attack identifier; revision replaces that choice without
spending mana. Normal interception, hit rolls and damage defences apply to both.
Darkness attack disadvantage is ignored, but Darkness still blocks visibility.

Both attack choices are visible as public creature statistics and are copied into
illusions; illusion damage remains reversible. Reanimation keeps the physical bow
attack and removes magical arrows through explicit body-attack metadata. This
uses the existing rule that magical powers do not become undead basic attacks.

Schema 17 / rules `roster-0.7` / content `mvp-five-families-0.1` records the expanded
content availability. No new resolver action or outcome rule is needed. Frozen
schema-16 validators and `migrateBallistaSnapshot` preserve historical attack lists,
committed targets, random state and reload history without adding abilities to
existing creatures. Two permanent fixtures cover the chosen magic and physical
shots, with atomic continuation checked in the headless engine and Chromium.

Coverage includes physical immunity, magic resistance, friendly interception,
order revision, invalid attack identifiers, Darkness, Guard, reanimation, illusion
reversal, public-view copy isolation and legacy continuation. The remaining 31
profiles and other Stage 7 abilities are still outstanding.

## Approved MVP reduction — 6 November 2026

The owner deferred both Goblin and Dragon families in full to the next version.
This supersedes earlier Stage 7 completion targets. MVP now contains Cat, Serpent,
Spirit, Plant and Archer: 40 profiles with the same 12 non-summoning spell families.
There are 22 implemented profiles in this scope, including Elven Archer, and 18
left. The implemented Hobgoblin, Goblin shaman and Dragonet familiar remain in the
catalogue with their regression tests, but are outside the MVP release roster.

Starting books and turn-three awards select only the 17 retained spell families
(14 random candidates plus the three guaranteed extras). New Goblin/Dragon summon
orders are rejected even if an older save retains their spellbook entries. Existing
creatures, portable identifiers and already committed casts are preserved rather
than deleting historical state. The full 56-profile data catalogue remains intact.

Remaining MVP creatures: Cougar, Lion, Fey leopard, Gryphon, Giant puma, Bobby;
Basilisk, Amphiptere, World Serpent; Wisp, Haunting shade, Ghost, Banshee;
Walking mushroom, Walking tree, Treant, Walking Forest; Shepherd. Goblin Command,
Rally, False King, Dragon breaths/Scorch and their family-specific work no longer
block MVP. Shared flight/mount/condition mechanics needed by retained profiles
still do. New scope tests cover pool sizes, retained roster counts, generated
starting books, repeated awards, and rejection of both deferred summon families.

Verification for Elven Archer and the five-family scope: 635 headless tests,
type checking, production build, 27 Chromium tests and all nine CLI scenarios
pass. Wall outcomes remain HP 4/11; current fingerprint is `fnv1a32-v1:22e42cb6`.

## Treant

Treant (Plant 5) is enabled, bringing the current MVP to 23 of 40 implemented
profiles, with 17 left. The three already implemented deferred Goblin/Dragon
profiles remain preserved separately. Treant uses the approved Size 4, Con 7,
Move 3, Dex 3, Int 6, HP 28; Skill 7 / physical damage 6 Branch attack at reach 2;
physical/cold resistance, fire vulnerability, flammability and regeneration 2.

No new combat rule is introduced: tests exercise the production reach, defence,
regeneration and illusion machinery against this profile. Its documented objects
and wood-weapon capabilities retain their existing equipment deferral; the listed
Branch attack is usable without introducing an inventory system. Plants remain
immune to poison/disease and leave no reanimatable corpse. Intelligent Treants
can be fooled by illusions, and illusory regeneration heals only the illusion.

Schema 18 / rules `roster-0.7` / content `treant-0.1` records new summon availability.
Frozen schema-17 validators and `migrateFiveFamilySnapshot` preserve existing
creature data, orders, random state and pending arrows without granting abilities.
A permanent pending Treant attack fixture verifies mid-resolution continuation
and recovery in the headless engine and Chromium.

Verification: 652 headless tests, type checking, production build, 28 Chromium
tests and all nine CLI scenarios pass. Wall outcomes remain HP 4/11; schema-18
fingerprint is `fnv1a32-v1:f4f692e8`.

## Haunting Shade

Haunting Shade (Spirit 2) is enabled, bringing the current MVP to 24 of 40
implemented profiles, with 16 left. Its explicit `passCreatures` capability permits
transit through allies, enemies and uncontrolled bodies without granting wall
passage. It must finish in a legal unoccupied footprint. Creature blocking is
rechecked during resolution; interrupted transit returns to the last legal resting
hex. Voluntary movement still triggers Guard. Illusions copy this movement trait.

Chill retains its approved damaging-hit requirement, Int resistance at potency 2
and one-turn Slowed duration. Tests verify reversible illusion provenance, zero
magic damage preventing Chill, major physical resistance and light vulnerability.

Schema 19 / rules `roster-0.8` / content `haunting-shade-0.1` stores passage as an
optional explicit capability. Frozen schema-18 validators and
`migrateTreantSnapshot` preserve historical creatures without inferring new powers.
The permanent mid-transit fixture preserves temporary overlap, the movement cursor
and the last legal resting position, then resumes identically to a legal endpoint.

Verification: 669 headless tests, type checking, production build, 29 Chromium
tests and all nine CLI scenarios pass. Wall outcomes remain HP 4/11; schema-19
fingerprint is `fnv1a32-v1:27175c58`. The browser run was resumed successfully
on 7 November after an automatic approval-review usage limit interrupted it.

## Cougar / Pounce interpretation (continuation checkpoint)

Implementation interpretation of “after at least three steps towards the target”:
count the final consecutive voluntary movement steps this turn that each strictly
reduce minimum occupied-footprint distance to the bite target's current footprint.
Use resolved steps, including a legal prefix of a blocked path; planned steps and
extra terrain movement cost do not count. A sideways/retreating step breaks the
approach run. Teleport and forced displacement clear the trail. Revalidate target
identity, reach and its current position at attack execution. The +2 is base bite
damage before critical hits and damage defences, and never applies to structures
or Guard reactions. Early bites have no preceding movement. Clear history at turn
start; never reconstruct it for historical snapshots. Illusions copy Pounce with
ordinary reversible damage; reanimated bodies retain basic bites but lose Pounce.
This is a routine implementation interpretation within the owner's delegated
Stage 7 scope, not a new accepted design decision.

Cougar (Cat 2) is enabled with its approved Size 2, Con 4, Move 6, Dex 7,
Int 2, HP 8 and Skill 5 / physical damage 3 bite. This brings the current MVP
to 25 of 40 implemented profiles; three deferred Goblin/Dragon profiles also
remain supported. Stage 7 is still in progress.

Schema 20 / rules `roster-0.9` / content `cougar-0.1` stores an optional explicit
Pounce capability and private resolved movement trail. Frozen schema-19 and
combat validators plus `migrateShadeSnapshot` preserve existing creatures,
committed work, transit cursors and RNG without inferring Pounce or past steps.
Historical fixtures remain unchanged. New permanent fixtures are
`cougar-v20-movement.json` and `cougar-v20-bite.json`; both continue identically
at every atomic boundary in the headless engine and Chromium. Public views copy
the ability independently and omit the authoritative trail.

Coverage includes three-step and shorter approaches, retreat/sideways paths,
blocked prefixes, terrain costs, current target identity/position and large
footprints, criticals, physical defences/immunity, misses, Guard interruption and
exclusion, structure attacks, displacement/teleport resets, invalid and no-op
forced moves, turn reset, illusion reversal, reanimation stripping, all three
Quick summon variants, malformed snapshots and explicit legacy migration.

Remaining MVP profiles: Lion, Fey leopard, Gryphon, Giant puma, Bobby the Master
Hunter; Basilisk, Amphiptere, The World Serpent; Wisp, Ghost, Banshee; Walking
mushroom, Walking tree, The Walking Forest; Shepherd. Their abilities, shared
flight/mount/detection/cover work and combined roster scenarios remain outstanding.
Full UI, AI and deployment remain later stages. The verbatim source archive
remains a release gate.

Verification: `pnpm check` passes 702 headless tests and type checking;
`pnpm build`, all 31 Chromium tests (`pnpm test:browser`) and all nine
`tools/run-*.mjs` CLI scenarios pass. Wall outcomes remain HP 4/11; schema-20
fingerprint is `fnv1a32-v1:75a01a30`. Local verification used Node 24.22.1,
pnpm 11.25.0 and the pinned Playwright 1.56.1 Chromium build; CI retains the
repository's pinned Node version.

## Walking Tree / Shove interpretation (stacked continuation)

This checkpoint continues the reviewed Cougar branch while PR #8 remains open;
it does not merge that PR. Walking Tree's Shove is an automatic passive on a
Branch hit that deals applicable damage, following the general secondary-effect
rule. A strictly smaller surviving target moves one hex directly away from the
Tree, using the existing six-sector centre geometry and its canonical boundary
tie. The destination and crossed edge must be legal for the whole target
footprint. A blocked push is wasted without selecting another direction. There
is no additional hit or resistance roll, action cost, cooldown or movement cost.

Shove also applies to damaging Guard hits. It uses ordinary forced movement:
no Guard reaction, casting interruption, wall hazards, weed contact, hold cleanup,
actual-movement history and Pounce reset. Incapacitated survivors can be moved;
dead creatures and dispersed swarms cannot. Illusory Trees copy the passive, but
cannot shove Int0 targets because they deal no applicable damage. Reversing an
illusion restores reversible damage and conditions, not a relocation already
resolved; later movement and occupancy are not rewound. Reanimation retains no
Shove capability. These are routine implementation interpretations within the
owner's delegated Stage 7 scope, not new accepted design decisions.

Walking Tree (Plant 4) is enabled with Size 3, Con 6, Move 2, Dex 2, Int 0,
HP 18; Skill 5 / physical damage 4 Branch at reach 2; physical/cold resistance,
fire vulnerability, flammability and plant immunities. Its object-handling marker
retains the established equipment deferral; Branch is fully usable. Current MVP
coverage is 26 of 40 profiles, with 14 remaining; three deferred profiles remain
supported and the historical 56-profile catalogue is intact.

Schema 21 / rules `roster-0.10` / content `walking-tree-0.1` adds optional explicit
Shove metadata. Frozen schema-20 and combat validators plus
`migrateCougarSnapshot` preserve existing creatures, Pounce trails, committed
attacks, RNG and cursors without adding Shove. New permanent fixtures
`walking-tree-v21-before.json` and `walking-tree-v21-after.json` verify the hit and
completed displacement as atomic boundaries in Node and Chromium. There is no
new half-resolved displacement state. Public views copy the capability independently.

Forced displacement now releases affected holds that extend beyond their
original limb reach, height or unobstructed contact; a still-reachable hold stays.
Coincident centres use the first canonical direction; the whole-footprint check
still applies, including the existing swarm overlap exception.
Tests cover reach/height/target revalidation, strict Size, misses, zero damage,
critical hits, no extra random roll, blocked edges/occupancy/boundaries, large
footprints, Guard, casts, Pounce, fire walls, weed contact, separated and retained
holds, incapacitation/death/swarm dispersal, illusions, plant defences/immunities,
corpse exclusion, reanimation stripping, all summon variants, malformed saves,
legacy migration and public-view isolation.

Remaining MVP profiles: Lion, Fey leopard, Gryphon, Giant puma, Bobby the Master
Hunter; Basilisk, Amphiptere, The World Serpent; Wisp, Ghost, Banshee; Walking
mushroom, The Walking Forest; Shepherd. Stage 7 remains partial. AI, the finished
playable browser UI and deployment remain later stages, and the verbatim original
specification archive remains an outstanding release gate.

Verification: `pnpm check` passes type checking and all 748 headless tests,
including 46 Walking Tree checks. `pnpm build`, all 33 Chromium tests
(`pnpm test:browser`) and all nine `tools/run-*.mjs` scenarios pass. Wall outcomes
remain HP 4/11; schema-21 fingerprint is `fnv1a32-v1:c5f93ea2`. Local verification
used Node 24.22.1, pnpm 11.25.0 and pinned Playwright 1.56.1 Chromium; CI retains
the repository's pinned Node version.

## Lion, Ghost and Basilisk — condition actions (stacked continuation)

This checkpoint continues PR #9 without merging PRs #8 or #9. Lion's Roar uses
one normal early or late action against enemies within minimum footprint distance
1, Int resistance potency 3, Fear for up to two turns. Ghost's Frighten selects
one adjacent enemy with Int resistance potency 4 and the same Fear duration.
Basilisk's Gaze selects one enemy within footprint distance 4, Int resistance
potency 5; success applies Slowed for two turns, or Restrained for two turns if
already Slowed. D02 governs the magical restraint: Escape uses Int against 5,
and the existing Slowed effect keeps its own expiry.

Implementation interpretation: these powers require clear sight from the actor,
use creature identity and current range/visibility at execution, work across
heights, and do not intercept through other creatures. Solid sight-blocking walls
and Darkness block them; crystal transparency permits them. They replace the
normal action, are not attacks/Guard triggers, deal no damage, and receive no hit,
critical or Defend modifiers. The approved ability records specify no cooldown
for these three actions, so no unlisted cooldown is introduced. Invalid single
targets waste the action without substitution. Roar snapshots eligible enemies
in canonical identifier order, then revalidates and resolves one resistance per
atomic step; no new target joins a committed Roar. One creature with a large
footprint is affected once. Current condition refresh/provenance rules apply.

Illusions copy the powers and retain reversible source-tagged conditions; Int0
targets ignore illusory powers. Real Gaze can slow/restrain Int0 creatures; Fear
immunities remain unchanged. Reanimation strips the powers while retaining the
approved basic body attacks. These routine implementation interpretations are
recorded under the owner's delegated Stage 7 scope, not new accepted decisions.

Lion (Cat 3), Ghost (Spirit 3) and Basilisk (Serpent 5) are enabled together,
bringing MVP implementation coverage to 29 of 40 profiles, with 11 remaining.
Their approved basic attacks, numeric profiles and defences are retained. Lion
uses the existing Pack tactics machinery; Ghost retains full incorporeal transit,
physical/poison immunity, light vulnerability and corpse exclusion; Basilisk
retains poison resistance and cold vulnerability. The full historical 56-profile
catalogue and the three implemented deferred profiles remain preserved.

Schema 22 / rules `roster-0.11` / content `condition-actions-0.1` adds optional
explicit power metadata and a private `pendingPower` continuation. Frozen
schema-21 and combat validators plus `migrateWalkingTreeSnapshot` preserve
existing creature data, committed attacks, Shove, Pounce trails, RNG and cursors;
older states receive a null continuation and no inferred powers. New power
conditions record their source and illusion provenance, and explicitly indicate
that they required no damage. Historical fixtures are unchanged.

Permanent fixtures cover mid-Roar after one completed victim, pending Frighten,
pending Gaze applying Slowed, and pending Gaze applying D02 restraint. Node and
Chromium verify exact continuation at each atomic step. Tests cover both action
phases, individual resistance outcomes, target identity/revision and revalidation,
canonical/non-expanding Roar victim lists, footprint range, visibility and walls,
Defend, action/readiness/Subdued budgets, interrupted actors, Fear movement and
attack penalties, recovery/expiry, Gaze escalation and Escape, immunities, spell
summon variants, illusions/reanimation, ordinary attacks, malformed saves,
explicit migrations and private-state filtering.

Remaining MVP profiles: Fey leopard, Gryphon, Giant puma, Bobby the Master Hunter;
Amphiptere, The World Serpent; Wisp, Banshee; Walking mushroom, The Walking Forest;
Shepherd. Stage 7 is still partial. AI, the finished playable interface and
deployment remain later stages; the verbatim original specification archive
remains an outstanding release gate.

Verification: `pnpm check` passes type checking and all 826 headless tests,
including 78 condition-action tests. `pnpm build`, all 37 Chromium tests
(`pnpm test:browser`) and all nine CLI scenarios pass. Wall outcomes remain
HP 4/11; schema-22 fingerprint is `fnv1a32-v1:7c87595c`. Local verification used
Node 24.22.1, pnpm 11.25.0 and pinned Playwright 1.56.1 Chromium; CI retains the
repository's pinned Node version.

## Approved merge and next three profiles — 7 November 2026

The owner explicitly authorised merging the open checkpoint stack. PRs #8, #9
and #10 passed Verification and had no unresolved review threads; they were
merged in order after retargeting #9 and #10 to main. Main is
`5f0a12f6d3e4d4c719b4b3dc03bb13f1151a3ca5`, with the same content tree as the
verified condition-actions head. This continuation starts a new branch from main.

### Fey Leopard, Walking Mushroom and Banshee implementation interpretations

Blink replaces one declared movement segment of up to three hex steps, once per
turn, spending its hex distance from the normal movement allowance. An optional
`blinkIndex` selects that destination in the planned path. Blink crosses ordinary
walls/creatures without transit occupancy or crossed-wall hazards, but cannot
cross Energy on the canonical left ray of any occupied hex, escape restraint,
approach a Fear source, bypass a casting movement lock or end illegally. It
triggers no Guard, while ordinary steps before/after it still do. Landing contacts
Tangleweed. Failure stops at the last legal resting position without rerouting.
Actual movement, used-turn state and the path cursor survive reload; Blink clears
an approach trail and grants no action-slot bypass. Illusions copy Blink;
reanimated bodies lose it.

Spores is one normal early or late action on one visible adjacent living real
enemy (including susceptible intelligent plants; excluding undead, constructs
and illusions). Con resistance against potency 2 applies Sleep/Unconscious
through the next action phase: early T -> end of late T, late T -> end of early
T+1. Damage or an allied Wake action ends it sooner. Phase expiry is explicit
condition data, never reconstructed for historical Sleep. Int0 immunity and
reversible illusory condition provenance apply normally.

D04 Wail spends one normal action and starts its listed three-turn cooldown
(used on T -> ready on T+3), even when nobody is affected. It snapshots all other
living creatures within footprint radius 3, including allies, across walls and
Darkness. Each victim independently resists 5 area magic damage with Dex against
6 for half, then susceptible living targets separately resist Fear with Int
against 6 for up to two turns; Fear does not require damage. There are no hit,
critical or Defend modifiers. The victim cursor, emission origin, action identity,
received-damage accumulator and cooldown persist. One victim resolves atomically;
concentration runs once per damaged caster for the whole action. A committed real
Wail finishes if its source/controller dies, like an emitted real area attack;
a dispelled illusory Wail stops and its reversible effects are removed. No new
victim joins the committed list; current radius/alive eligibility is rechecked.
Cooldowns and private continuations are owner-only data. These routine details
implement the approved profiles and D04 within delegated Stage 7 scope.

Known Sleep expiry at the end of the coming Early phase permits planning only
movement/Late actions for the awakened unit; its Early slot stays unavailable,
and execution still revalidates any renewed Sleep. Other incapacitation and
historical Sleep without explicit phase expiry keep their existing restrictions.
The Wail controller-death interaction also exposed an existing lifecycle omission:
real Spirit summons must collapse on wizard death, as the specification requires;
ordinary non-Spirit summons still unbind. This checkpoint corrects that rule and
covers it together with continuation of the already-emitted real Wail.

Fey Leopard (Cat 5), Walking Mushroom (Plant 1) and Banshee (Spirit 6) are now
enabled with their approved ratings, attacks, defences and body classifications.
Coverage is 32 of 40 MVP profiles, with eight remaining. The historical catalogue
and three already-implemented deferred profiles remain intact.

Schema 23 / rules `roster-0.12` / content `blink-spores-wail-0.1` stores explicit
Blink, Spores and Wail capabilities, Blink path/use metadata, phase-based Sleep
expiry, Wail cooldowns and its continuation accumulator. Frozen schema-22 state
and combat validators plus `migrateConditionActionsSnapshot` preserve committed
condition actions, creature data, conditions and random streams without granting
new abilities or inferring phase expiry for historical Sleep. Binding/Release
cancellation clears a Blink marker together with the cancelled path.

Six new permanent fixtures cover before/after Blink, early/late Sleep, mid-Wail
after one resolved victim and cooldown planning. Headless and Chromium tests
restore every atomic boundary with equal events, state and permitted views.
Additional coverage checks movement costs and failure, Energy and occupancy,
Guard and late attacks, restraint/Fear/casting, Tangleweed, control changes,
phase expiry and planning, Con resistance and living-target rules, damage/Wake,
Wail friendly fire/height/geometry, Dex and Int resistance, immunity/area damage,
Double Action/cooldown, emitted origin and controller/source death, concentration,
illusion reversal, reanimation, all summon variants, profile defences, privacy,
malformed state and explicit legacy migrations.

Remaining MVP profiles: Gryphon, Giant puma, Bobby the Master Hunter; Amphiptere,
The World Serpent; Wisp; The Walking Forest; Shepherd. Stage 7 remains partial.
AI, the finished playable interface and deployment remain later stages. The full
verbatim original specification archive remains an outstanding release gate.

Verification: `pnpm check` passes type checking and all 900 headless tests,
including 74 Blink/Spores/Wail checks. `pnpm build`, all 43 Chromium tests
(`pnpm test:browser`) and all nine CLI scenarios pass. Wall outcomes remain
HP 4/11; schema-23 fingerprint is `fnv1a32-v1:d9322096`. Local verification used
Node 24.22.1, pnpm 11.25.0 and pinned Playwright 1.56.1 Chromium; CI retains the
repository's pinned Node version.

Pre-merge review follow-up: known Early wake-up now participates in defence
preparation as well as order validation. Late Defend is registered before Late
initiative, without an Early defence phase; otherwise the accepted order had no
hit-roll effect. Regression scenarios show the same seeded attack hitting an
undefended awakened target and missing with planned Late Defend, with exact
atomic continuation.

Review-fix verification: 902 headless tests (76 focused checks), type checking,
production build, all 43 Chromium tests and all nine CLI scenarios pass. The
schema-23 wall fingerprint remains `fnv1a32-v1:d9322096`.
