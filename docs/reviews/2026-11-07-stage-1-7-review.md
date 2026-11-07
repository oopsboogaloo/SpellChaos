# Code and design review — Stages 1–7

Date: 7 November 2026 · Reviewed commit: `efd3b7e` (main, after PR #14) · Reviewer: Claude Code

This review covers the design documents and all code merged through Stage 7. Each finding below is tracked as a GitHub issue; the issue holds the reproduction details. This file is the summary record and is not updated as issues close — check the issues for current status.

## Summary

The engine is deterministic and heavily tested (1,040 tests passing; engine line coverage 99.9%, branch 96.6%). A scripted check found all 40 MVP profiles match SPECIFICATION.md exactly, and most formulas and accepted decisions (D01–D22) are implemented correctly.

The main problems are:

1. **Hidden information leaks** through command validation errors, movement events and planning-time side effects.
2. **Several rule interaction bugs**, most seriously conditions from different sources overwriting each other.
3. **Save integrity gaps**: corrupt states load and play, and saves carry no content hash.
4. **Process drift** from the approved plan: the Stage 0 source archive was never produced and traceability is largely circular.
5. **Maintenance cost**: 25 schema versions in about five days with full frozen copies, dense one-line code and package import cycles.

## Scope and method

- Read DESIGN.md, PLAN.md, SPECIFICATION.md and the stage reports, then reviewed six areas in parallel: engine core and orders; combat, damage and conditions; casting and environment; hidden information and movement specials; geometry and occupancy; persistence, tests, traceability and CI.
- Each suspected defect was checked with a temporary test (since deleted) against the real engine. Findings marked *confirmed* were reproduced; others are labelled as code-reading or as needing a ruling.
- The review began on `d27bc7f`; every bug was re-checked against `efd3b7e` before filing.

## Findings

### Hidden information

| Issue | Severity | Finding |
| --- | --- | --- |
| [#15](https://github.com/oopsboogaloo/SpellChaos/issues/15) | High | Planning validators (Teleport, Summon, Wall placement, Fear, Reanimate, powers) use full state, so error codes reveal invisible creatures, Darkness occupants, Fear source positions and hidden corpses. |
| [#16](https://github.com/oopsboogaloo/SpellChaos/issues/16) | Medium | `PathTruncated` vs `PathPrepared` reveals distant hidden blockers and enemy path lengths; contact reveal fires at the wrong step for creatures that can pass through. |
| [#17](https://github.com/oopsboogaloo/SpellChaos/issues/17) | Medium | The global `revision` and global `commandId` space reveal opponents' drafting; views have no revision, so a view-only UI cannot issue commands. |
| [#18](https://github.com/oopsboogaloo/SpellChaos/issues/18) | Medium | `ReleaseHold` and `CancelCast` change live state during planning and are visible to opponents before lock. |
| [#19](https://github.com/oopsboogaloo/SpellChaos/issues/19) | Medium-low | The web preview reads authoritative state and raw events instead of `projectView`/`projectEvents`. |

### Rules and geometry

| Issue | Severity | Finding |
| --- | --- | --- |
| [#35](https://github.com/oopsboogaloo/SpellChaos/issues/35) | High | Same-kind conditions from different sources overwrite each other: Slowed is shortened, and restraint or Fear moves to the wrong source. |
| [#20](https://github.com/oopsboogaloo/SpellChaos/issues/20) | Medium-high | Sight, melee and projectile legality test only one tie-broken cell pair between footprints. |
| [#21](https://github.com/oopsboogaloo/SpellChaos/issues/21) | Medium | Exactly opposite flankers fail at the sector 5/0 boundary. |
| [#22](https://github.com/oopsboogaloo/SpellChaos/issues/22) | Medium | Ray side is hard-coded to `'left'` in sight, Guard, powers, Haunt and Blink. |
| [#24](https://github.com/oopsboogaloo/SpellChaos/issues/24) | Medium | Setup, resolution and AI RNG streams are one sequence offset by one draw. |
| [#25](https://github.com/oopsboogaloo/SpellChaos/issues/25) | Medium | A Subdued creature loses its action after being shoved or dragged. |
| [#36](https://github.com/oopsboogaloo/SpellChaos/issues/36) | Medium | Walking Forest and World Serpent sweeps cannot hit an overlapping swarm. |
| [#37](https://github.com/oopsboogaloo/SpellChaos/issues/37) | Medium | A late-phase Guard is accepted but can never react. |
| [#27](https://github.com/oopsboogaloo/SpellChaos/issues/27) | Medium-low | Death walls give illusions real healing. |
| [#28](https://github.com/oopsboogaloo/SpellChaos/issues/28) | Low-medium | Walls and flyers are inconsistent (placement under a flyer; air-to-air shots over ordinary walls). |
| [#26](https://github.com/oopsboogaloo/SpellChaos/issues/26) | Low | An unresolved Dash still allows doubled movement on costly steps. |
| [#38](https://github.com/oopsboogaloo/SpellChaos/issues/38) | Low | Grapple, Escape, Treat, Wake and Extinguish emit no outcome events; one vine can hold a target with both limbs. |

### Persistence

| Issue | Severity | Finding |
| --- | --- | --- |
| [#23](https://github.com/oopsboogaloo/SpellChaos/issues/23) | High | Snapshot validation accepts overlap, board clipping, wall-bisected footprints, bad HP/maxHp and a reused `nextEntityId`. |
| [#29](https://github.com/oopsboogaloo/SpellChaos/issues/29) | High | No content hash in snapshots; load errors are opaque; there is no version-dispatching loader; malformed commands throw a raw ZodError. |
| [#31](https://github.com/oopsboogaloo/SpellChaos/issues/31) | Medium | 53 legacy schema files (~657 KB, ~96% duplicated) and direct-to-current migrations built on live engine code. |

### Process, architecture and testing

| Issue | Severity | Finding |
| --- | --- | --- |
| [#30](https://github.com/oopsboogaloo/SpellChaos/issues/30) | High (process) | No verbatim spec archive (the Stage 0 gate); traceability is circular and stale. |
| [#32](https://github.com/oopsboogaloo/SpellChaos/issues/32) | Medium | Packages are not real packages; import cycles; no layering check; very dense code. |
| [#33](https://github.com/oopsboogaloo/SpellChaos/issues/33) | Medium | Turn cost grows faster than quadratically (900 creatures ≈ 150 s per turn); full `structuredClone` per atomic step. |
| [#34](https://github.com/oopsboogaloo/SpellChaos/issues/34) | Medium | No generated command-sequence or leak tests, coverage not enforced, no Stage 7 tools, Chromium only. |

### Rulings needed

[#39](https://github.com/oopsboogaloo/SpellChaos/issues/39) collects 26 rules questions. Eleven of them are already implemented one way without a decision record, which DESIGN §11 forbids. Examples: grapple potency, Teleport range from a familiar origin, concentration on end-of-turn damage, and Magic Attack spread through Crystal.

## Overall concerns

1. **Stage 0 was skipped.** PLAN required a verbatim specification archive before application code, and seven stages were built against the condensed register instead. *Resolved by owner decision: SPECIFICATION.md is now the authority.*
2. **Hidden information is opt-in.** Views copy fields one at a time, event redaction strips named fields, and planning validators share resolution code. New features leak by default. A single player-knowledge arena for validation, deny-by-default public schemas and a generic "states differing only in a secret look identical" property test would close this structurally.
3. **Persistence ceremony outweighs protection.** There are no real saves yet, but each schema bump costs a 25–30 KB frozen copy plus migration edits. Meanwhile, what DESIGN §9 actually asks for — a content hash, semantic invariants, clear version errors and a replay format — is missing.
4. **Evidence is weaker than it looks.** Traceability "requirements" are mostly test titles, many continuation tests compare the code with itself, and line coverage is inflated by dense lines.
5. **Readability.** Long multi-statement one-liners make spec conformance hard to review. A formatter and smaller functions would lower the review cost of every later stage.

## Areas checked and found correct

- **Formulas:** hit, crit, effect, escape, casting success and concentration; advantage/disadvantage cancelling; pack tactics; threatened ranged attacks; Defend (D09).
- **Damage:** resistance × vulnerability rounding; immunity; swarm D07; Ballista D05; zero-damage rules; HP bands; incapacitation and death thresholds.
- **Conditions:** Bleeding, Poison refresh, Sleep, Slowed and regeneration (including while incapacitated); L+1 expiry; end-of-turn step order including D14.
- **Named abilities:** Wail D04, Gaze D02, Chill/Wither D03, Marked Quarry D01, Roar, Frighten, Spores, Bristles, Drain, Shove, Pounce, constriction and Root Network.
- **Magic:** mana, half-point balance, casting times, familiar origins, Bind/Release, bolt numbers, starting book D15, awards, regeneration, creature caster caps.
- **Environment:** swarm thresholds, all Wall/Tangleweed/Darkness numbers, reanimation and illusion reversal.
- **Orders and RNG:** queue sort keys and tie ranks, Slowed/Quick ordering, missed-turn surrender, unbiased bounded draws, idempotency and stale-command rejection.
- **Geometry:** offset/axial conversion, footprint counts, exact integer rays (3,000 random cases), canonical edges, D11 nearest-legal ordering.
- **Saves:** restore is transactional; old saves are never silently migrated; all 73 historical fixtures migrate deterministically and round-trip.
- **Roster:** all 40 MVP profiles match the specification numerically.

## Owner decisions (7 November 2026)

1. **SPECIFICATION.md is the authority.** No verbatim source archive is required. DESIGN, PLAN and SPECIFICATION carry a banner saying so, and the README is updated. Gaps or ambiguities in the register get a numbered owner ruling. This resolves the Stage 0 part of [#30](https://github.com/oopsboogaloo/SpellChaos/issues/30); the traceability part remains open.
2. **Old saves may be deleted.** Development saves need no backward compatibility. Legacy schema validators, migration functions and historical save fixtures may be removed, and the schema may restart at version 1 for release ([#31](https://github.com/oopsboogaloo/SpellChaos/issues/31)).

## Open questions for the owner

1. Should coverage thresholds and a traceability check become blocking CI gates now?
2. Is Chromium-only browser testing acceptable until Stage 9?
3. Do you want real workspace packages with enforced layering and a code formatter?
4. Please rule on the items in #39 before dependent work continues.

**Recommended order:** fix #15, #35 and #23, and decide #24, before Stage 8 (AI) or Stage 9 (UI) builds on them.
