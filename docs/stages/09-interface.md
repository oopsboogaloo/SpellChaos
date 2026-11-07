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
