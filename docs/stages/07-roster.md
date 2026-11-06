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
