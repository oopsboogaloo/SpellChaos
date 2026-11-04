# Stage 6 — mechanics implemented; review pending

Current checkpoint: Reanimate, swarms, illusions, Darkness, Tangleweed, all Wall materials and structural targeting. 4 November 2026.

The initial reanimation checkpoint below is historical; the swarm increment and
later increments and latest verification are recorded below.
The final report at the end supersedes the historical remaining-work lists below.
Stage 6 mechanics are implemented; this is **not the playable MVP or release acceptance**.
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

Stage 6 remains open: all eight Wall casting/material
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

## Illusion implementation decisions

- S6-R11: Damage history records source, action, typed components, applied amount
  and remaining loss. Healing consumes oldest reversible loss before real loss;
  previously untracked scenario/save injuries are real baseline damage.
- S6-R12: Real and independently sourced illusory condition instances coexist.
  Reapplication refreshes the matching instance. A damage condition still ticks
  only once: prefer a real active instance, otherwise earliest application and
  stable source ID. Removing an illusion cannot erase a real condition.
- S6-R13: Death cleanup first marks every lethal member of its snapshot dead,
  then reverses illusion damage. Neither iteration order nor simultaneous source
  removal can revive a victim already killed. Reversal never heals the dead.
- S6-R14: Illusory fire/acid suppresses regeneration for its application turn,
  but cannot burn a real corpse into a skeleton. Illusory damage restoration
  does not undo previously missed regeneration or completed actions.
- S6-R15: Unknown enemy illusions are valid apparent Healing Bolt targets;
  casting can spend mana and succeed but cannot heal them. Known illusions can
  be rejected during planning without creating a hidden-information oracle.
- S6-R16: Detection is an engine capability for specific creature abilities,
  not a universal player command. It records truth for that player only and
  never removes the illusion. Original creators remember truth after transfer.

- S6-R17: The illusion speed clue is at most +2 steps to the turn allowance,
  after ordinary Dash/Slowed calculations. It does not change listed Move or
  movement-priority statistics, and Total Defence still forbids movement.
- S6-R18: Player event feeds omit authoritative sequence numbers. Otherwise
  gaps caused by a private detection success could disclose hidden information.

## Illusion increment — 4 November 2026

All enabled summon profiles now support the Illusion variant: half base mana,
rounded up, guaranteed casting success and normal successful balance shift (D16).
Placement, casting interruption and next-turn readiness still apply. The owner
sees truth; opponents see the claimed species, statistics, attacks and defences.
Illusions retain copied combat traits but cannot cast, supply familiar origins,
regenerate mana, heal real creatures, manipulate real resources or leave corpses.
They cannot damage Int 0 creatures or apply secondary restraints to them.

Damage records retain source, action, typed components, final damage and remaining
loss. Healing consumes oldest reversible loss first. Disbelief, destruction and
caster/controller death remove source conditions and grapples and restore only
remaining damage to survivors. Cleanup freezes the entire lethal batch first;
mutual illusion deaths, shock deaths and wizard elimination remain permanent.
Real and illusory conditions coexist without multiplying ongoing damage. The
original caster's identity survives binding changes or Release.

Detection is a player-specific engine capability for later creature abilities;
it is not a new universal player action. It reveals truth without removing the
illusion. Public events redact exact enemy damage, private detections and global
sequence numbers. Healing Bolt's planning validation accepts unknown enemy
illusions as apparent targets, preventing a free truth probe; it cannot actually
heal them. Known illusions may be rejected during planning.

Schema 7 / rules `environment-0.3` / content `illusion-integration-0.1`.
Damage history, condition provenance, creator identity, private knowledge and
attack action IDs are serialised. Schema-6 validators and content availability
are frozen; explicit migration treats pre-illusion injuries as a real baseline
and adds no RNG draws. Earlier migrations remain supported. Invalid provenance,
unknown player/source IDs, excessive reversible loss and reviving a processed
death are rejected before replacing the running game.

Four immutable schema-7 fixtures cover planning, a partially resolved illusion
attack, the boundary before Disbelief and completed removal. Generated atomic
continuation uses seed 7001 (30 cases). The new CLI compares restored and direct
execution at all 33 steps, restoring one survivor while preserving another
victim's death. Chromium matches Node state and permitted event/view output.

Latest verification: **321 headless tests and 13 Chromium tests passed**, along
with typechecking, production build and all six CLI scenarios. GitHub Actions
includes `node tools/run-illusions.mjs`. Full roster-specific detection, illusion
copies of later abilities and browser presentation remain their planned stages.
Stage 6 still needs Wall casting/material interactions, structural targeting,
Darkness, Tangleweed and their combined interaction replays. This remains a draft
checkpoint with no merge or deployment. The full verbatim source archive remains
outstanding; the condensed register is not presented as that archive.

The latest instrumented suite also passed all 321 tests: engine coverage is
100% lines / 95.38% branches; the illusion module is 100% for both. Whole-repository
Vitest coverage is 86.18% lines / 82.12% branches, including frozen validators and
files exercised separately by browser/CLI runs. This is not full-game coverage.

### Darkness checkpoint decisions (before implementation)

R19: Darkness uses a ground centre, radius `1 + floor(L/3)`, range 8,
Quick casting and expiry at end of casting turn + L. Areas clip to the board;
overlapping clouds coexist and do not increase disadvantage. Each cloud retains
its caster, and ends on that caster's death.

R20: A ray touching any dark hex (including either endpoint) blocks sight.
Adjacent creatures may still attack, with disadvantage, but solid walls still
block them. This exception does not grant spell targeting through Darkness.
Large footprints use the existing nearest occupied-hex ray. Darkness vision
traits have an explicit range; ignoring attack disadvantage alone does not
provide sight. Full roster assignment remains Stage 7.

R21: Owners always inspect their creatures. Hidden enemy occupants are omitted
unless an active controlled observer has sight or is adjacent. Enemy-targeted
commands must use a visible creature. Area attacks can target remembered ground;
they still obey projectile/wall rules. Event audiences are captured when emitted,
so later cloud expiry cannot reveal previously hidden actors through the log.


### Darkness implementation checkpoint

Implemented all eight Darkness levels with Quick completion, radius scaling,
expiry, overlap and caster-death cleanup. Sight, ranged attacks, familiar origins
and Magic Attack spread consult the cloud geometry. Adjacent attacks remain legal
with disadvantage; arcing area attacks may target remembered ground. Owner views
retain their creatures, enemy occupants and corpses are filtered, and events
capture permitted audiences before cloud expiry. Vision-range and disadvantage
traits are portable fields; full creature assignments remain Stage 7.

Schema 8 / rules `environment-0.4` / content `darkness-integration-0.1` adds cloud
state and vision traits. `migrateIllusionSnapshot` explicitly upgrades schema 7
without changing RNG, wound provenance or pending attacks; validators and old
fixtures remain frozen. Three new fixtures cover planning, queued casting and an
active cloud. `tools/run-darkness.mjs` checks every atomic boundary of a turn in
which a Quick cloud invalidates a planned ranged shot; fingerprint
`fnv1a32-v1:8c38ed66` after 32 steps.

Wall casting/material hazards and structural targeting, Tangleweed and combined
Stage 6 acceptance remain outstanding. Full responsive UI, AI and deployed play
remain later stages. The verbatim specification archive is still outstanding;
this checkpoint does not resolve that documentation gate.

Validation: `pnpm check` passed 351 tests; production build passed; all seven
headless CLI scenarios passed. Chromium passed 14 tests, including Node/browser
Darkness replay parity. CI runs these same checks; this remains an engine
checkpoint, not a full gameplay or release acceptance report.

### Tangleweed decisions before implementation

R22: Choose exactly L distinct, connected hexes, with the first as the aiming
anchor. One locked origin must have range 8 and sight to every hex. Connections
cannot grow through solid walls. Existing creatures do not invalidate placement.
Each patch persists through turn T+L, has 3L HP per hex, and ends on caster death.
Overlapping patches retain independent HP and duration.

R23: A grounded creature pays 2 movement points for a step whose destination
footprint touches any living weed hex, regardless of footprint size or overlap.
Flying creatures pay the ordinary cost. Paid movement is serialized separately
from path index so changing terrain cannot retroactively change spent movement.

R24: Weed attempts restraint on creation beneath a grounded creature and on entry
(including teleport/forced entry), at most once per creature per turn across all
patches. Resolve multiple patches by highest level, then stable patch ID; choose
the first covered hex in canonical coordinate order. Apply potency L against
2×Size, including mindless creatures and allies. Standing still alone does not
retry. Escape contests the retained patch's potency against physical resistance;
it removes only that weed hold. Expiry, caster death, destruction of the holding
hex, leaving coverage or becoming airborne releases the hold. Other restraints
remain intact. This contact rule also applies to grounded incorporeal creatures:
Tangleweed is magical restraint.

R25: Weed is destructible spell terrain with no additional damage defence.
Ground-targeted bolts/projectiles may damage it if no creature or wall intercepts;
area attacks damage each intersected weed hex once per shot, with no critical or
resistance roll for terrain. Illusions cannot damage it. Direct melee structural
targeting is delivered with the remaining Wall/structure work.


### Tangleweed implementation checkpoint

Implemented the eight levels, connected layouts, a single locked origin with
range/sight to every hex, Slow timing, per-hex HP, duration and caster cleanup.
Grounded footprints pay double movement cost once per step; paid movement is
stored independently from path index. Contact includes creation, voluntary
movement, teleport, forced movement, summoning and reanimation. Once-per-turn
attempts and source-specific holds survive snapshots. Escape and terrain removal
preserve unrelated restraints. Airborne creatures ignore weed contact and cost.

Ground-targeted bolts/projectiles respect creature and wall interception before
damaging weed. Area damage touches each terrain hex once per shot, including
multi-victim attacks resumed between victims. Illusions cannot damage terrain.
Direct melee structural targeting remains outstanding with Wall implementation.

Schema 9 / rules `environment-0.5` / content `tangleweed-integration-0.1` adds
patches, attempts, holds and spent movement. `migrateDarknessSnapshot` explicitly
upgrades schema 8 and preserves any already-paid unit-cost steps. Earlier
migrations also preserve those steps. Frozen validators/fixtures remain intact.
Five schema-9 fixtures cover planning, casting, movement, restraint and attacks.
The combined CLI runs 32 atomic steps, ending with two patches and one of the
new patch's hexes destroyed; fingerprint `fnv1a32-v1:2a3f5844`.

Local verification: `pnpm check` passed 387 tests, Chromium passed 15 tests,
including Node/browser Tangleweed parity, and the production build passed.
Wall casting/material hazards, direct structural targeting and final combined
Stage 6 acceptance remain. The verbatim source archive is still outstanding;
this is an engine checkpoint, not the finished MVP or a deployed release.
All eight headless CLI scenarios also passed against this production build.

### Wall and structural-targeting decisions before implementation

R26: Wall selects 1 to L+2 connected hex-edge segments. One locked origin must
have range 8 and sight to the nearest on-board side of every segment. The first
segment supplies the ground anchor. Placement rechecks footprint conflicts and
existing edges at completion. Each cast is one wall network; each segment has
5+3L HP. Its selected material determines alignment, including interruption.
Walls have no duration and disappear when their caster dies.

R27: A grounded footprint crossing one or several segments of a hazard network
triggers that network once per turn. Thorns deal 3 physical, Fire 6 fire and
Death 10 necrotic, with normal defences; Death instead heals undead by 10.
Ordinary wall hazards do not reach airborne creatures; Energy still blocks flight.
Thorns double the step cost, combining with weed by taking the larger cost rather
than multiplying. Teleport does not cross edges. Adjacent forced movement crosses
edges normally; non-adjacent trusted relocation remains an instantaneous effect.
Crossing effects resolve before Guard reactions, with death/concentration cleanup.

R28: Attacks may explicitly select a wall segment or a weed patch hex. A wall is
aimed at its nearest adjacent on-board hex, with wall range at least 1. This
approach and ray side are used consistently by previews and resolution. Melee
structural attacks require a grounded attacker and clear access; ranged attacks
use normal creature/wall interception. Magic Bolt and Fire Bolt accept the same
structural targets. Stationary structures are hit automatically without critical
rolls; intercepted creatures use the normal attack and critical rolls. Illusory
attacks may be ordered but cause no structural damage.

R29: Area shots damage each intersected segment once per shot (either adjacent
hex intersects the area). Ground projectiles also damage their first wall
interception. Fire Bolt ignites surviving wood for 2 fire damage at the next two
turn ends, refreshing without stacking; adjacent Extinguish remains available.
Iron ignores ordinary fire. Destroyed terrain disappears immediately. Direct weed
selection damages the chosen patch only; an untargeted ground impact affects all
patches sharing that hex.

R30: Refreshing Burning extends its end to the next two turn ends but retains
an already-scheduled tick in the current turn. This applies to wood and creatures;
repeated ignition cannot postpone all damage indefinitely. Destroyed wall IDs are
retained as tombstones so previously submitted targeting/Extinguish orders remain
portable while resolving to an invalid target.


### Wall and combined environment implementation report

Implemented connected Wall layouts at levels 1–8, edge-specific HP and caster
ownership, material-specific success/balance/interruption, Slow casting and
placement revalidation. Solid edges respect footprints; crystal passes sight but
blocks projectiles, and Energy blocks flight/incorporeal movement. Hazard networks
apply typed damage or undead healing once per creature per turn. Thorn and weed
movement penalties combine without multiplying; crossing history and paid movement
survive snapshots. Hazards resolve before Guard, with no reaction from a lethal
crossing. Teleport bypasses edge hazards; adjacent forced movement obeys walls.

Ordinary attacks, Magic Bolt and Fire Bolt can target wall segments and weed hexes.
Projectile interception uses normal creature hit/critical rules; stationary terrain
uses the documented automatic-hit ruling. Area attacks touch each wall segment once
per shot. Illusions cannot damage structures. Wood burning, refresh, extinguishing,
expiry, destruction and caster-death removal are covered. A refresh cannot cancel
an already-due tick on either wood or a creature.

Schema 10 / rules `environment-0.6` / content `wall-integration-0.1` adds structural
targets, edge layouts, wall ownership/network metadata, crossing history and
destruction tombstones. `migrateTangleweedSnapshot` explicitly upgrades schema 9;
earlier validators and fixture bytes stay frozen. Five new fixtures cover planning,
casting, hazard crossing, interception and a resolved turn.

The combined production-engine scenario runs 39 atomic steps: an illusion wounds
a wizard, a fire crossing deals real damage, weed costs extra movement, Disbelief
reverses only illusion damage, and a new crystal wall intercepts a late projectile.
Final wizard HP is 4; crystal HP is 11; fingerprint `fnv1a32-v1:7662cfca`.
Node and Chromium run the same scenario with restoration at every atomic boundary.
Additional integration tests cover Darkness and wall targeting, multi-victim area
attacks, Guard/death ordering, hazard re-entry and next-turn reset, and source-specific
weed destruction. The earlier reanimation, swarm, illusion and Darkness suites remain
part of the same regression run.

All planned Stage 6 mechanics are now implemented and ready for review. Stage 7
owns the full 56-profile roster and creature-specific interactions; later stages own
AI, responsive gameplay, release hardening and deployment. The verbatim source
archive and full-source acceptance reconciliation remain outstanding release gates;
this report does not claim those are complete. Implementation PRs remain unmerged.

Verification: `pnpm check` passed 439 tests, Chromium passed 16 tests, the production
build passed, and all nine headless CLI scenarios passed. The instrumented run of
438 tests before the final crystal-interception regression measured engine coverage
at 100% lines / 95.39% branches. Whole-repository Vitest coverage was 87.05% lines /
78.36% branches, including frozen validators and files exercised separately by CLI
and browser runs. These are implementation measurements, not full-game coverage.
