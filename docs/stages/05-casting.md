# Stage 5 — casting, mana, alignment and control

Status: implemented casting engine increment. This is not the complete playable
MVP; the staged content and interface boundaries below remain explicit.

## Delivered

Cast orders share the existing owner/revision/turn validation and early/late
budgets. Drafts reserve their combined mana without spending it. Replacement and
ClearOrder release reservations; starting a cast spends its full cost. Failed or
interrupted casts do not refund it. CancelCast is an owned, idempotent planning
command for ongoing casts; cancelling an unstarted draft costs nothing.

Instant resolves at initiative. Quick completions follow all ordinary and Slowed
actions, using captured normal initiative among themselves. Slow completes at the
caster's next action-phase initiative, including late-to-next-turn early. The
same scheduler supports Ritual 2 and Ritual 3: early turn 1 to late turn 2/3.
No ritual spell is enabled in MVP; a trusted scripted scenario verifies that
infrastructure. Double Action does not accelerate casting.

Casting occupies its start and subsequent slots through completion. The caster
and locked familiar cannot move while casting. Completion slots consume the
normal action allowance; default Total Defence is not granted to ongoing casters.
A creature may plan movement before a late cast, or after an early completion.

- Success uses current global balance at completion. Balance is stored in integer
  half-points: success adds 2×alignment×level; failure/interruption adds
  alignment×level. Resisted control still counts as casting success.
- Damage triggers one concentration check per attack action, using its accumulated
  damage per target. Incapacitation, death, forced displacement and origin/control
  loss interrupt without a concentration roll. Zero damage never checks.
- Closest eligible origin is chosen at start from the wizard or controlled real
  familiars, with unlimited wizard-to-familiar distance. Ties prefer the wizard,
  then oldest familiar, then stable ID. The origin locks until completion (D20).
  All listed spell ranges and projectile paths use that origin. The independent
  four-hex mana bonus is capped at one living real familiar.
- Wizards regenerate 5 mana, creature casters their listed 1; pools cap normally.
  Regeneration begins at the end of turn 1. Unknown-family awards occur after
  turns 3, 6, 9; exhausted books receive 10 mana instead. Eliminated players do
  not receive rewards.
- Starting books contain 10 distinct non-guaranteed families plus Disbelief,
  Bind and Release. Selection is uniform over valid 10-family subsets of the 16
  eligible families and enforces D15's summon/damage/utility guarantees.
- Creature casters have explicit private books, maximum levels and mana pools.
- Own books, mana, reservations and complete cast records are private. Global
  balance is public. No opponent draft/origin-lock state is projected.

## Spell effects and content boundaries

Magic Bolt, Fire Bolt, Magic Attack, Healing Bolt, Teleport, Bind, Release and
Disbelief's real-target contract are implemented at levels 1–8. Magic/Fire Bolts
use interception and separate hit/critical rolls. Fire Bolt ignites flammable
creatures after positive damage. Healing bypasses interception, heals L+3,
removes Bleeding and rejects undead/illusions.

Magic Attack independently rolls against each victim's Int, includes other teams,
spreads only from the original family target and never chains. Solid walls,
including crystal, block family spread. Original direct targeting still uses
line of sight. Teleport checks its full destination footprint and never triggers
Guard. Bind/Release have normal casting then Int resistance, with separate stored
summon and binding levels. Actual control changes cancel the previous owner's
remaining orders/reactions; upgrading an existing friendly binding preserves them.

Summon and Bind and Summon Only share the Quick scheduler. The former needs only
one casting roll at creation. The latter costs rounded half mana, gains 20 chance
points (95 cap), and creates an unbound creature. Placement is checked at planning
and completion; a newly blocked placement spends full mana without relocation.
New summons occupy/block immediately but cannot act until the next turn.

The summoning registry currently contains the approved Cat familiar, Snake
familiar and Dragonet familiar level-1 profiles. These verify real passives,
poison, flight geometry, family alignment, origin selection and control without
generic stand-ins. Remaining levels/families and complete flight controls are
Stage 7. Unsupported summon profiles are rejected as CONTENT_NOT_AVAILABLE.
Formula tests still cover all levels 1–8 for both variants.

The spellbook pool records the approved entire MVP pool. Wall, Tangleweed,
Darkness and Reanimate are not castable until Stage 6. Illusion creation and
source-aware Disbelief removal are also Stage 6; Disbelief costs 2, consumes no
success dice and does nothing to real creatures now. Illusion fixture targets
are explicitly rejected until provenance is available. Physical wall targeting,
wall ignition interactions and environmental visibility belong to Stage 6.
No unsupported effect is silently replaced with a generic summon or no-op cast.

## Explicit implementation choices

- Spell success draws uniformly from one million outcomes. The threshold is the
  formula's percentage ×10,000 rounded down, preserving fractional balance
  modifiers to 0.0001 percentage points. It does not round the formula up to a
  whole percentage point. Integer attack/resistance rules retain their existing
  percentage dice.
- Invalid range/sight/target before casting starts wastes the action without
  spending mana. Invalid completion after starting spends full mana and shifts
  half alignment as failure, without consuming a success roll.
- Simultaneous ongoing damage at turn end is one concentration batch per caster;
  ordinary multiattack damage is accumulated until that attack action finishes.
- Cancellation can be submitted during unlocked planning. Resolution never
  depends on live human input or animation timing.
- Teleport remains subject to Restrained and Fear's voluntary-movement rules;
  it does not grant an unstated escape or break holds. It can use a familiar
  origin like other spells. An early Teleport's planned path starts at its
  intended destination; failure leaves the actual path subject to normal
  adjacency checks. Teleport records actual movement for later Aim integration.
- Familiar mana regeneration is a living passive trait; incapacitation prevents
  remote casting but does not remove the nearby mana bonus.
- Flanking now explicitly requires the attacker to be adjacent as well as its
  ally. This corrects an uncovered ranged-attack case from Stage 4; Pack Tactics
  retains its separately specified ally-adjacency condition.

## Portable state and migrations

Schema 4 / rules casting-0.1 / content casting-integration-0.1 adds spellbooks,
creature mana metadata, family/level/binding identity, familiar creation order,
integer balance, occupied cast slots, serialized Quick completion order, stable
entity allocation and complete ongoing cast records. Each record preserves its
paid cost, chosen origin/positions, start, timing and completion boundary.

Load validation checks target shapes, timing/payment consistency, origin/caster
references, available effect content, duplicate casters and planning reservation
ledgers. Restoring never silently upgrades a save. Frozen schema-3/combat validators
and the existing v1/v2 fixtures are retained. migrateCombatSnapshot explicitly
adds new combat-era spell metadata and draws starting books using the setup stream;
old damage, orders, queues and resolution RNG remain intact. Older explicit
migration entry points now target schema 4. This is a deliberate rules upgrade,
not a claim that legacy rules simulated spells.

Permanent v4 fixtures cover planning reservations, queued Quick completions,
late Slow spillover and a three-turn ritual. Each is decoded and continued in
fresh state, with identical events and results to uninterrupted execution.

## Verification and review

```sh
pnpm check
pnpm test:coverage
pnpm build
node tools/run-turn.mjs
node tools/run-combat.mjs
node tools/run-casting.mjs
pnpm test:browser
pnpm dev
```

The casting CLI runs two turns: a wizard moves, begins a late remote Bind through
its distant cat, then completes next turn. It restores every atomic step.
Expected fixed scenario: turn 3, mana 90, balance +2. The browser's “Cast through
a familiar” panel exposes step/save/restore controls for that same scenario.
Chromium and Node compare exact events and canonical snapshots over both turns.

Verification: 193 headless tests and nine Chromium tests, TypeScript checks,
production build and all three CLI scenarios. The headless suite covers all eight formula levels, books/awards, reservations,
all casting times, concentration, origin ties/loss, missile interception,
control levels/resistance, healing, teleport, blocked placement and corrupt
saves. Forty reproducible casting seeds complement explicit expected outcomes.
The generated casting test and coverage-instrumented test runs have a 30-second
per-test harness budget. Instrumentation exceeded the default five seconds on
this shared runner; trial counts and per-scenario step limits are unchanged.
This harness timeout is separate from the Stage 10 engine performance budgets.

[Executable checks](../traceability/casting-checks.json). GitHub Actions also runs
all three headless review scenarios and browser checks.

The complete original specification archive remains outstanding as recorded in
prior stages. No deployment is included. Next: Stage 6 illusions, swarms,
Wall/Tangleweed/Darkness and reanimation, followed by the complete roster.
