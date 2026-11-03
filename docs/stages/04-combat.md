# Stage 4 — combat and lifecycle

Status: implemented. GitHub CI checks the committed revision. This remains a
headless engine increment with a development browser shell.

## Delivered

Attack orders now resolve through the early and late queues. Each subattack and
area victim has an atomic continuation, including accumulated damage per target.
AttackFinished reports one total per target for Stage 5 concentration integration.
No casting/concentration mechanic is simulated ahead of that stage.

- Hit clamps, separate critical rolls, advantage/disadvantage cancellation,
  automatic hits, pack tactics, sector flanking and ranged melee threat.
- Typed damage, strongest resistance/vulnerability, per-component ceiling,
  immunities and swarm fire/area precedence (D07). Defend only affects hit rolls
  in its selected action phase (D09), never area resistance or automatic hits.
- Melee, intercepted projectiles, direct targeted attacks and ground-targeted
  areas. Creature identity follows its target; ground aim stays fixed. Empty-hex
  projectiles intercept normally (D10). Multiattack subtargets resolve in order
  (D19); invalid targets waste only their own subattack.
- Guard with normal action initiative for simultaneous reactions, once per enemy
  for melee and once total for ranged, optional target/area restrictions, and
  serialized immediate reactions between movement steps. Only voluntary movement
  queues Guard; forced relocation and direct placement do not.
- Grapple hit plus physical resistance, explicit attack reach or adjacency,
  one hold per limb, independent Escape contests and free owned ReleaseHold.
  Holds immobilize both participants; incapacitated grapplers release holds.
- Bleeding, poison, delayed acid/burning, sleep, restraint, Subdued, Slowed, Fear
  and Disease. Effects refresh rather than multiply. Treatment, waking,
  extinguishing creatures/edge walls, healing and suppressed regeneration.
- HP/health bands, damage-based incapacitation, dead-at-negative-maxHP (swarm
  zero), usable corpses, cumulative skeletal fire/acid exposure, permanent player
  elimination, summon unbinding and servant collapse. Death is idempotent.
- End damage snapshots → cleanup/victory → recovery → expiry/extra victory
  (D14) → next planning turn. Simultaneous fatal damage can produce a draw.
- Exact HP and damage totals stay private to owners in player views/events.

## Timing and implementation choices

Guard enters range from outside the attack's valid range and height, with sight
and melee wall checks. Target and area restrictions filter that entry. Merely
remaining in range does not retrigger Guard. Reactions finish before the next
movement step; a dead or incapacitated guard cannot execute its queued attack.

If a flyer, incorporeal creature or nimble ally is interrupted while passing
through an otherwise illegal resting footprint, it stops at its last legal
resting footprint. This emits MovementInterrupted and does not trigger Guard as
new voluntary movement. This is an explicit resolution choice for transit
interruption, retaining legal occupancy without automatic rerouting.

Action/movement consumption is recorded so newly applied Subdued cannot grant a
second action or movement after an action. A Slowed change during movement can
shorten the remaining path. Fear prevents each voluntary step that approaches
its living source; application and end-turn removal use Int resistance.

Damage conditions use their listed damage type; Bleeding is direct HP loss.
Poison ticks on its application turn and the next two. Acid and ignited wood
start next turn and tick twice. Disease becomes active after the third end step,
including its application turn. Regeneration does not treat Bleeding.

The generic attack schema describes mechanisms, not the complete creature roster.
Conditional abilities, named multi-target area patterns, physical wall attacks,
wall hazards/ignition casting and flight/mount commands arrive with Stages 6–7.
The geometry already supports projectile interception; invisible-target previews
will use Stage 6's visibility rules. Unbound AI is Stage 8: unbinding cancels the
former owner's executable orders/reactions, and the creature stays put for now.

## Save schema 3

Versions: schema 3, rules combat-0.1, content wizard-0.2. Save data includes attack
profiles, damage/HP/conditions, hold limbs, Guard history, queued reactions,
per-hit continuation and totals, corpses, death cleanup markers, turn activity,
last legal movement position and end-step cursor. Each is plain portable data.

Schema 2 is frozen in legacy-v2.ts. migrateOrdersSnapshot validates an old save,
retains its orders, initiative, RNG and position, and explicitly adds the new
combat defaults: Con 5, maxHP 5×Size, staff, no conditions or reactions. Existing
geometric walls receive HP from their material's level (5+3L). Dead units receive
negative maximum HP. This is a deliberate rules upgrade, not an assertion that
old rules already simulated combat. Schema 1 retains its separate migration.
Normal loading rejects both old versions and unsupported versions.

Permanent fixtures cover mid-multiattack, queued Guard and damage-before-cleanup.
Existing v1/v2 fixtures remain unchanged. Corrupt entity references, attack
identity, continuation cursors and inconsistent version data are rejected before
replacing a running game.

## Verification

```sh
pnpm check
pnpm test:coverage
pnpm build
node tools/run-turn.mjs
node tools/run-combat.mjs
pnpm test:browser
```

The combat CLI uses three wizards, a triple attack, a moving target, a Guard and
poison. It compares uninterrupted and freshly restored transitions at every
boundary. Expected outcome: turn 2, HP [10,5,10]. Chromium runs the same initial
snapshot and produces identical events and final state.

Local verification passed: 129 headless tests, seven Chromium tests, TypeScript
checks, production build and both CLI scenarios. The headless suite includes seeded multiattack continuation trials, exact dice
checks, invalid commands, hit/damage boundaries, grapples, Guard interruption,
condition timing, simultaneous deaths, migration and privacy regressions.
[Executable requirement mapping](../traceability/combat-checks.json).

The full original-specification archive remains outstanding as recorded in prior
stages; the condensed register is not presented as that archive. No deployment
is included. Next: Stage 5 spellcasting, mana, alignment and control.
