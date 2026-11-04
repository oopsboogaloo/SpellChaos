# Stage 2 — hex geometry and occupancy

Status: implemented and verified locally; GitHub CI results are linked from the PR.

## Delivered

- Pointy-top odd-row display coordinates with axial/cube distances, 30×30 board
  bounds and exactly 1 metre adjacent-centre spacing.
- Size1–10 compact footprints, nearest-occupied range, overlap, radius areas and
  opposite sectors for large-footprint flanking. Active-ally eligibility belongs
  to the combat stage, not the sector primitive.
- Canonical edge identities, including boundary edges. Wall placement rejects
  solid edges through creatures and duplicate occupied edges.
- Exact rational ray clipping with explicit left/right selection. No floating
  epsilon or platform-dependent rounding enters ray-cell decisions.
- Separate sight, direct projectile, arcing projectile and movement queries.
- Footprint placement/transit rules for allies, Nimble, flight, incorporeal
  movement, swarms, mindless creatures versus illusions, and riders/mounts.
- Static legal path prefixes, blocked stopping, nearest legal placement,
  area victim deduplication and same-height swarm coverage recalculation.
- Seeded, evenly spaced wizard starts around the inset perimeter for2–8 players.
- A Canvas development preview with Size, player-count and position controls.

## Deterministic definitions

Coordinates are axial q/r; the display column is q+floor(r/2). Direction order is
(1,0), (0,1), (−1,1), (−1,0), (0,−1), (1,−1). Sector boundary ties select the
lowest direction index. Ordinary nearest-position ties compare q, then r; explicitly
random game exceptions will call RNG separately in their ability implementations.

The inset perimeter visits offset rows/columns2 through27 clockwise, including
each corner once:100 cells. Seeded rotation selects its initial index. Slot i is
floor(i×100/playerCount) from that index, so gaps differ by at most one step.

Rays clip the segment against six exact integer half-planes per candidate cell.
Zero-length vertex contact does not count as entering a hex. A segment running
along a shared boundary chooses one of the equal intervals using its stored
side. Left means positive axial cross-product side; the screen preview must
display the selected path rather than infer a side from screen rotation.
Reverse a ray and exchange sides to obtain exactly the reversed path.

For example, (0,0)→(1,1) passes through (0,1) on the left path and (1,0) on
the right path. The boundary choice therefore changes which creature intercepts.
BigInts are transient rational arithmetic only; geometry scenarios and commands
retain JSON-safe integer coordinates and the side string.

## Interaction decisions recorded under delegated judgment

- Ordinary creatures require unoccupied resting footprints even while airborne
  or incorporeal; these traits grant transit exceptions. Swarm overlap, mount
  sharing and mindless passage through illusions are explicit exceptions.
- Mounted entities use their mount's complete footprint and height for area and
  projectile queries; Size-based statistics remain the rider's own. Invalid
  missing/cyclic mount links are rejected by footprint resolution.
- A directly selected rider or mount is preferred among occupants at the first
  intercepted hex. Other same-hex interception ties use stable creature ID order.
  An earlier blocking creature still intercepts regardless of chosen target.
- New solid walls cannot bisect any creature footprint. Passable hazard walls
  can be placed there; damage and effect timing belong to the combat stage.
- Static path preview returns a prefix ending at a legal resting footprint.
  Reaction-aware movement must revalidate in Stage3; it must not animate rejected
  preview transit or treat this helper as a substitute for Guard resolution.

## Checks and review artifacts

`pnpm check`, `pnpm build`, `pnpm test:browser`.

61 headless tests in total, including48 geometry tests; seeded properties cover
1,000 coordinate roundtrips, distance inequalities and400 exact ray reversals.
Four browser tests include Node/Chromium geometry equivalence and a narrow-screen
footprint preview. All56 profiles remain future content; Size tests are not claims
that those creature abilities are implemented.

The [requirement-to-check map](../traceability/geometry-checks.json) lists this
stage's implemented spatial requirements. The original condensed-source inventory
is not marked universally complete. Full source archival remains outstanding.

Run `pnpm dev` to inspect the preview. It is diagnostic UI, not the final game.

## Next stage

Integrate map/creatures and spatial commands into authoritative snapshots, then
implement simultaneous planning, budgets, phase ordering and serialized movement
continuations. Combat, hazards, mount action costs and reactions are not simulated
by this geometry increment. No game save schema changes were needed for these
pure spatial helpers; scenario roundtrip tests exercise their portable inputs.
