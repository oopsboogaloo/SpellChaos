# Stage 3 — simultaneous orders and phase resolution

Status: implemented; local checks pass. GitHub CI verifies the committed revision.

## Delivered

- SetOrder, ClearOrder and LockTurn with authority/control checks, revision
  validation, atomic replacement and persistent duplicate-command acknowledgements.
- Explicit scheduler-only DeadlineReached and StartResolution commands. Player
  submissions cannot invoke the scheduler interface through applyCommand.
- Editable creature paths and early/late choices for Defend, Total Defence and
  Dash. Ordinary, Double Action, Subdued, restrained and Slowed budgets apply.
- Default Total Defence for unordered units. Its defence covers both phases;
  Defend covers its selected entire phase before the actor's initiative.
- Mana-reservation replacement primitive with overspend checks and cancellation.
  Enabled Stage3 actions cost zero; spell-cost derivation remains Stage5.
- Early → movement → late → next planning turn. Each phase captures current
  initiative statistics, wizard distance and unique seeded random tie ranks.
- Complete paths resolve unit by unit, while each movement step is independently
  saveable. Paths stop at blockers without swapping or rerouting.
- Queue indices, active path, path index, phase initialization and RNG are portable
  state. Reloading a boundary never rebuilds an already initialized queue.
- Dead, incapacitated and not-yet-ready actors skip their existing queue slot.
- Explicit lock counts as participation. At the deadline, the latest submitted
  draft is auto-locked; an inactive player gets defaults and a missed-turn count.
  Three consecutive misses surrender, unbind ordinary summons, collapse reanimated
  and illusion entities, and end the match if a winner/draw is established.
- Own drafts/reservations are projected only to their owner. Draft edits produce
  no opponent-visible events. System queues and random state remain private.

## Decisions and integration boundaries

Planning validates path continuity, terrain, footprint bounds and movement budget,
while treating current creature positions as provisional. This permits moving into
space expected to be vacated. Resolution checks actual occupancy in movement order.

A path is prepared as a legal prefix when its actor starts moving, then each step
is checked again. Stage4 will add reaction continuations; this stage does not
simulate Guard or forced displacement between those checks.

Dash extends movement only if its early action actually resolved. Queue ordering
still uses the creature's normal effective Move, not its doubled Dash allowance.
Defend records are installed before initiative resolution, excluding inactive and
not-yet-ready actors. Their incoming-hit disadvantage is consumed by Stage4 combat.

The shared queue sorter supports ordinary, Slowed and Quick groups. No cast can be
submitted in Stage3; actual Quick completions and long casts arrive in Stage5.
Likewise, end-turn poison, duration expiry, mana regeneration and spell awards are
not approximated here. Unbound decision-making is Stage8; the current unattended
fallback is Total Defence.

The timer adapter reads an injected clock and emits an explicit deadline command.
A null deadline disables timing. Once the turn is ready/resolving, a delayed timer
callback is a no-op. Draft submission or explicit locking is participation, even
when the player chooses no movement. This follows the specification's statement
that drafts remain editable until locking or deadline.

Surrender's current cleanup covers entities and ownership. Damage-provenance
restoration, corpses, ongoing spell cancellation and other death effects will be
extended in their respective stages; no absent effects are claimed implemented.

## Save schema 2 and migration

Current versions: schema2, rules orders-0.1, content wizard-0.1. Geometry and unit
state now live inside authoritative saves. Permanent fixtures cover partially
planned and mid-movement states; the original foundation-v1 fixture is unchanged.

restoreSnapshot rejects schema1 rather than silently changing its rules. The
explicit migrateFoundationSnapshot function validates that old format, preserves
players, command acknowledgements, locks and resolution/AI RNG streams, and
initializes the previously nonexistent wizard/map data from the old setup RNG.
The setup stream advances for deterministic spawning. That is a deliberate format
upgrade, not a claim that old foundation rules can resolve the new game. No older
schema or unknown rules/content version is supported.

The schema checks references, versions, duplicate entities/commands, player locks
and participation, action shape, path connectivity, queue bounds/tie uniqueness,
reservation totals and terminal result consistency before replacing any game.

## Reproducible review

```sh
pnpm check
pnpm build
node tools/run-turn.mjs
pnpm test:browser
pnpm dev
```

The CLI plans a four-step Dash and compares uninterrupted and freshly restored
execution at every atomic boundary. It completes at turn2, position(9,5), emitting
its event sequence and state fingerprint. The browser's “Plan and step a turn”
panel provides the same class of review with checkpoint save/restore controls.

84 headless tests include23 order/resolver tests,60 seeded full-turn save/restore
runs, permanent fixtures, deadline races, action budgets, complete-path collisions,
unique tie ranks and surrender cleanup. Six Chromium tests include interactive
mid-movement restoration and complete Node/browser turn equivalence.

[Requirement mapping](../traceability/orders-checks.json). Full original-source
archival remains outstanding as previously recorded; the condensed inventory is
not presented as a complete source archive.

## Next stage

Attack resolution, typed damage, resistance, Guard reactions, grapple/Escape,
condition lifecycles, HP, corpses and the complete death-cleanup sequence. No
network multiplayer or production deployment is included in this increment.
