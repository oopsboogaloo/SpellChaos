# Stage 9 — Browser interface (in progress)

First checkpoint: a local human-versus-AI match loop with an authoritative browser
worker. Presentation receives `projectView` output only; private saves are emitted
solely on explicit export. Ordinary engine commands and the Stage 8 AI coordinator
handle drafting, locking and resolution. Rejection messages are generic and order
validation first uses the permitted knowledge state.

The screen provides 1–7 AI opponents, seed selection, a visible-creature map,
accessible roster and coordinate path editing, basic action/timing/target drafts,
AI delegation, lock, pause/play/step/speed, and explicit private export/import.
Imports validate before replacing the current state. Existing development scenarios
remain available while the finished interface is built.

Validation: TypeScript and production build; browser workflows at 390, 768 and
1280 CSS pixels cover draft, turn resolution, exported save restoration and invalid
imports. These are viewport tests, not physical touch/stylus device verification.

This is a checkpoint, not completion of Stage 9. Remaining: Canvas hex board with
terrain/footprints and path/target overlays; pointer pan/pinch/drawing; full spell,
variant, attack and special-action editors; uncertainty-aware previews; timer and
new-game difficulty; IndexedDB autosave/recovery; filtered event log and replay
seeking; full-match acceptance, screenshots, touch and pen workflows. The current
map shows creature positions only and is not yet a tactical terrain renderer.
Remote play remains deferred under docs/remote/REMOTE-PLAY-SPEC.md.

## Tactical-board checkpoint

PR #43 merged with owner approval at `41c54ca`. The next checkpoint replaces its
position sketch with Canvas rendering over the filtered view: canonical offset
hexes, visible occupied footprints, player numbers, airborne labels, health bands,
wall edges by material, Tangleweed and Darkness coverage. Selection and numbered
draft routes are overlaid. Explicit select/target, path and pan modes use Pointer
Events, pointer capture/cancellation, two-pointer zoom and dedicated zoom/reset
controls. Coordinate editing remains available independently of Canvas hit targets.
Path input only appends adjacent cells; engine validation still decides legality.

Browser regression cases exercise mouse/touch/pen hex targeting, draft submission
and pan-mode separation. These synthetic pointer tests do not claim physical-device
coverage. Full spell/special-action editors, autosave/recovery, timers, event/replay
controls and full-match acceptance remain outstanding. Stage 9 is still partial.

## Spell drafting checkpoint

The local order panel now exposes only the selected creature's spellbook. It builds
ordinary Cast orders with level, summon variant, target/ground, ray side and the
selected Early/Late timing. Wall edges and Tangleweed cells can be appended and
undone using coordinate inputs. Reanimation lists visible corpses. Mana, casting
time and current-balance success estimates use shared content functions; validation
and commitment remain in the worker. Estimates are not guaranteed outcomes.
Browser coverage checks exported orders for illusion summons, Darkness, Wall and
Tangleweed, alongside the existing pointer, turn and save workflows.
Full special-action editing, structure targeting, richer preview/inspection,
autosave, timers, event/replay controls and full-match acceptance remain pending.
