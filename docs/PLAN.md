# Spell Chaos — staged implementation plan
Version 0.1 · 2 November 2026 · **AWAITING OWNER APPROVAL**

## Authority and execution contract
The owner approved [DESIGN.md](DESIGN.md), including D01–D22, and requested this plan. The original specification v0.9, its later MVP overrides and those accepted decisions govern implementation. [SPECIFICATION.md](SPECIFICATION.md) remains a condensed reference.

This plan does not begin implementation. After approval, execute stages in order, commit each completed stage to GitHub and provide its reviewable result, checks and remaining limitations. Unless the owner's approval specifies continuous execution, pause after each stage for review before beginning the next. Routine fixes needed to satisfy a stage belong to that stage and need no additional permission.

No subset of the roster or rules is called the complete MVP. All 56 profiles, all 12 non-summoning families, the three summon variants, required devices and mandatory serialization/testing are release requirements. Optional balance tooling is included as an independently runnable stage because the approved design includes it; it never changes game rules or blocks normal play.

Implementation commits should be grouped by stage on a working branch with a reviewable pull request. Do not merge implementation PRs until their stage review is accepted, unless plan approval explicitly authorizes merges. Docs in this planning turn are committed to main as requested. Release deployment is Stage 12; no preview should be presented as the finished game.

## Dependency sequence
0 source and traceability → 1 foundation → 2 geometry → 3 orders and resolver → 4 combat/lifecycle → 5 casting/control → 6 illusion/environment/reanimation → 7 complete roster → 8 AI/headless matches → 9 browser experience → 10 verification/hardening → 11 optional matchup tool → 12 deployment/verification.

Persistence, security of views and tests begin with the engine foundation and grow at every stage. Stage 10 consolidates evidence; it is not when automated testing starts.

## Definition of done for every stage
- Relevant requirement IDs link to implementation and executable tests; accepted decisions are cited.
- Normal, boundary, invalid-input and failure cases covered with meaningful expected results.
- Any new state, effect or continuation has round-trip and fresh-engine continuation tests.
- Existing tests pass; CI evidence identifies the tested commit and content/rules versions.
- No stubbed gameplay, hidden dropped requirement or TODO is counted as implemented.
- Commit and stage report list changed behaviour, reproducible verification commands, result, screenshots where relevant and known limitations.
- New gameplay ambiguities receive an explicit documented ruling before dependent code. Do not reinterpret locked profiles for convenience.
- No new deployment or external service dependency without a concrete documented reason.

## Stage 0 — Source archive and executable requirement inventory
**Deliverables:** docs/SPECIFICATION-SOURCE-v0.9.md containing the entire original user-supplied text, preserved without summarising; source digest and provenance; distinguish it from the condensed register. Record the full source's section inventory, all future-scope tables and all56 profiles. Create docs/traceability/requirements.json and a readable coverage index, plus a decision ledger marking D01–D22 accepted.

Assign IDs to rules, spells/levels, profiles, abilities, interactions, save states and input workflows. Status values: deferred-by-spec, planned, implemented, verified. Future rules stay archived but do not become MVP acceptance requirements. Map each MVP requirement to stages below.

**Checks/gate:** compare archive against supplied text, verify table/section completeness and all56 profiles. Inventory every ability, not only numeric stats. Archival is outstanding work and must finish before application code; if exact original text cannot be recovered from the conversation, report that specific issue and obtain a source file rather than inventing a verbatim archive.

**Review artifact:** source archive, traceability index and accepted-decision ledger.

## Stage 1 — TypeScript foundation and portable engine contract
**Deliverables:** pnpm workspace, strict TypeScript, pinned Node/package-manager/dependency versions and lockfile; domain, engine, content, persistence, views and scenario module boundaries; minimal web shell only for build verification. GitHub Actions typecheck/unit/build workflow and documented local commands.

Define JSON-safe stable IDs, command envelopes, event records, snapshot header, version compatibility and transactional decoding. Select/version a 32-bit integer PRNG, named streams and known-answer vectors. Introduce fake clock scheduler interface, atomic-step API and canonical state hashing. Establish immutable fixture policy and schema migration mechanism; do not invent fake supported legacy saves.

**Checks:** deterministic RNG vectors; malformed/unknown-version/ref-integrity rejection without replacing running state; command idempotency; round-trip empty/minimal match; identical Node/browser-engine outcomes. Import checks forbid DOM/time/random globals in engine.

**Review artifact:** headless minimal state that saves, reloads and produces identical events; green CI.

## Stage 2 — Hex geometry, footprints and visibility primitives
**Deliverables:** odd-row display↔axial/cube conversions, legal30×30 board, radii0–4 footprints, nearest-occupied range, canonical edges, sector flanking, wall crossings, rational boundary-ray choice, areas and inset-perimeter spawning for2–8 players. Separate line of sight, projectile interception and movement legality.

Add test-only geometry viewer/fixtures, including large footprints. Model flight/transit/endpoints, overlapping swarms and rider sharing without yet enabling incomplete combat.

**Checks:** footprint counts1/7/19/37/61; conversion/distance symmetry properties; corners/edges/off-board rejection; boundary-ray side differences; ordinary versus Energy walls; nearest-boundary projectile origin; each start legal and distributed along inset perimeter.

**Explicit fixtures:** a radius1 creature beside a wall cannot straddle it; an area intersects several occupied hexes but enumerates its creature once; a ray exactly along a boundary follows its stored side after reload.

**Review artifact:** geometry diagrams and deterministic scenario results.

## Stage 3 — Simultaneous planning and phase resolver
**Deliverables:** validated draft/revise/lock commands, resource reservation framework, defaults/deadline/missed-turn surrender input, action budgets, ordinary/Slowed/Quick queues, phase snapshots/tie keys, complete-path movement, serialized cursors and continuations. Implement movement, Dash, Defend and Total Defence semantics; skip ineligible/dead actors without queue reshuffling.

**Checks:** tie priorities, complete path ordering, blocked stop without swap/reroute, early versus late budgets, Double Action slots, Slowed minimum/Move0, lock idempotency, stale commands and partial-turn restore. Timer disabled, deadline races and three missed turns tested with injected clock.

**Review artifact:** scripted turn advanced step-by-step, restored at every boundary with identical events.

## Stage 4 — Combat, conditions, reactions and death
**Deliverables:** hit/advantage/crit, typed damage components and rounding, automatic hits, resistance, attack actions/multiattacks, Guard, grapples/Escape, holds, conditions, healing/recovery and ordered end-turn batches. Implement corpses, permanent elimination, surrender cleanup, phase victory and post-expiry check D14.

Build movement-triggered Guard continuation and per-action damage accumulation now, ready for concentration. Include ranged threat, pack/flanking, fire/acid exposure, treatment and extinguishing framework.

**Checks:** chance clamps, cancellation of advantage/disadvantage, zero-damage triggers, resistance/vulnerability/immunity combinations, once-per-enemy Guard, no forced-movement Guard, independent Escape per hold, simultaneous deaths/draws, HP boundaries, heal-incapacity, conditions expiry/application turn, restore mid-multiattack and mid-reaction.

**Acceptance example:** two-hit action damages a caster twice but will request one concentration check with total received damage. Grapple uses listed explicit reach if present, otherwise adjacency; held entities remain fixed except explicit Drag.

**Review artifact:** combat and lifecycle scenario catalogue with exact expected outputs.

## Stage 5 — Spellcasting, mana, alignment and control
**Deliverables:** all casting times as reusable engine infrastructure, reservation/spend/cancel, balance half-points, success at completion, interruption and familiar origins. Implement starting books/awards, Summon+Bind/Summon Only, Bind, Release, Disbelief targeting contract, Magic Bolt, Fire Bolt, Magic Attack, Healing Bolt and Teleport.

Illusion variant is wired only when Stage6 provides its full semantics; it must not appear as a fake ordinary summon. Creature casting lists/caps remain data-driven.

**Checks:** every level1–8 cost/chance/range; B=0 and±40 and caps; no double alignment shifts; resisted cast still successful; interruption exactly once; blocked placement consumes spent mana; new summon passive-only this turn; origin ties/range/sight/lock and remote familiar loss; invalid creature target versus fixed ground target; D15 book guarantees and uniform eligible sampling.

**Review artifact:** caster scenarios demonstrating full turn, Slow spillover and ritual timing/restore, even though ritual spells remain outside MVP content.

## Stage 6 — Illusions, swarms, walls, darkness and reanimation
**Deliverables:** reversible damage/condition provenance, healing ordering, permanent shock deaths, per-player illusion detection and redacted events; swarm overlap/shrink/regrowth/restraint/fire-area exceptions; all eight Wall levels, Tangleweed, Darkness and Reanimate. Add projectile interception, height and arc interactions against environment.

Reanimation derives profiles with stripped/retained capabilities and accepted binding D22. Implement body eligibility, skeletal exposure, restoration limit and controller death cleanup.

**Checks:** survivor restoration versus dead permanence; illusion-on-illusion removal chains; Int0 passage/immunity; healing cannot target illusions/undead; source effects remove cleanly; swarm exact half/quarter boundaries, legal regrowth and no corpse; all eight wall materials; footprint invalidation between planning/resolution; darkness adjacency and detectors; same-height coverage; zombie/skeleton differences and no resurrection of eliminated player.

**Acceptance examples:** duration2 applied during turnT expires at end of T+1 unless a specific next-phase/next-turn rule overrides it; Tangleweed radius/edge contact is measured by occupied hexes, whereas walls test crossed edges. Non-integer half damage follows approved component ceiling; Ballista D05 keeps its explicit pre-defence half rounding.

**Review artifact:** bluffing and environment replay fixtures, including hidden-information assertions.

## Stage 7 — Complete content and all creature-specific interactions
**Deliverables:** full56 profiles and their attacks, defences, spells and abilities; no generic replacements for named mechanics. All twelve non-summoning spell families enabled at all levels. Complete flight, mount/dismount, Drag and legal rider placement, reload/cooldowns, area siege shots and breath.

Ability coverage groups:
- Cat: Nimble, Pounce, Roar, Bleeding, Blink, Dive, Drag, Double Action and detection.
- Serpent: poison, Ambush, swarms, gaze, spit, Hydra multiattack/regen, World Serpent sweep/constriction.
- Goblin: vision, Scramble, Brace, caster lists, Rally, Command and False King.
- Dragon: familiar/spark, Scorch, sting, all breaths/cooldowns, Dread Roar and multiheaded alternatives.
- Spirit: Haunt, passage exceptions, Chill, Frighten, Wither, drain healing, Wail and Marked Quarry.
- Plant: Spores, equal-size/two-limb grapples, Bristles, Shove, regeneration, grove, Root Network and cover.
- Archer: Aim, minimum range, selectable arrow type, Ballista penetration, reload and siege areas/structures.

**Checks:** parameterized numeric/profile/level assertions, every named ability's normal/failure/boundary scenario, all accepted D01–D22 cases, loss of abilities on reanimation, illusion copies and exclusions, cooldown2 turn1→turn3, reload never firing turn, fully blocked death dismount D12.

**Review artifact:** completed content coverage matrix and curated tactical replays. No balance changes without an explicit proposed revision.

## Stage 8 — Fair AI and unattended complete matches
**Deliverables:** view-only wizard policy, unbound perception/targeting/pathfinding, seeded bounded candidate scoring, full matches2–8 players, reproducible headless CLI scenarios and failure capture. Difficulty changes decision policy, never hidden information or stats.

**Checks:** two authoritative states differing only in secrets produce identical player view and same AI orders given same AI seed; independent random streams; legal orders across all content; nearest perceived different-species rules; unreachable-target fallback; bounded AI work; long games stop under harness limits without falsely declaring engine victory.

**Review artifact:** seeded tournament smoke report recording victories, draws, harness timeouts and failures separately.

## Stage 9 — Complete responsive browser game
**Deliverables:** React UI/Canvas board/worker, new game, roster, map navigation, inspect, path drawing, attack/spell variants/level, timing, preview, revise, lock, turn resolution and victory. Pause/step/speed/event log, saved games/export/import and replay seeking. Phone bottom sheet/tablet/desktop layouts with colour-independent player glyphs and accessible DOM controls.

Use Pointer Events and explicit pan/target modes; touch/stylus/mouse all complete the same workflows. Worker emits only filtered views/events to presentation. No essential hover/right-click/pressure/keyboard action.

**Checks:** Playwright full match plus controlled scenarios on phone/tablet/desktop; touch pan/pinch and alternatives; pen targeting and mouse drag; preview respects secrets; load fresh browser session; interrupted save writes/recovery; remaining timer restore; rendering speed cannot alter simulation hash. Screenshots use fixed seed/font/viewport and disabled nonessential motion.

**Review artifact:** runnable local build, responsive screenshots and automated browser traces.

## Stage 10 — Complete acceptance and performance hardening
**Deliverables:** audit traceability against full source and accepted decisions; regression fixtures for every published atomic boundary and supported schema version; generated cross-feature sequences; deterministic visual suite; Node/browser replay equivalence; benchmark runner.

**Release thresholds:** engine lines>=95%, branches>=90% plus complete MVP behavioural traceability. Chromium/Firefox/WebKit pinned with Playwright; mobile/pen emulation limitations documented. p95 input response<100ms, usual frame work<16.7ms, bounded engine step<50ms on recorded reference environment. Measure64/256/1024 creatures without adding a creature cap.

PR regression corpus and scheduled expanded soak retain seeds/snapshots/commands. Record iteration counts/timeouts and benchmark hardware with results. Reference measurements establish runner variance; do not weaken approved budgets silently. Any game-mechanics tuning is separate from correctness fixes.

**Review artifact:** acceptance report, supported-browser matrix, coverage/traceability gaps (must be zero for release scope), performance results and reproducible failures if any.

## Stage 11 — Optional matchup simulator
**Deliverables:** CLI selecting full roster or subsets,1596 unordered pairs including mirrors, repeated seeded trials and swapped sides; same engine with scenario-specific termination. Configurable start distance/terrain/control policy/turn and operation limits. Export JSON/CSV and viewable matrix with wins/losses/draws/failures, win-rate denominator, Wilson intervals, health and turn counts, versions and seeds.

**Checks:** subset/full enumeration, mirror cases, side swaps, deterministic replay, batch termination, errors separate from draws and confidence interval fixtures. Run small CI smoke; full batches scheduled/manual. Results are scenario-dependent; no automatic stat changes.

**Review artifact:** sample matrix and reproducibility command. This optional tool can be delivered separately if the owner prioritises release, without changing core acceptance gates.

## Stage 12 — GitHub Pages deployment and deployed verification
**Deliverables:** Pages workflow with minimal permissions, /SpellChaos/ base path and no server-dependent routes. Build immutable artifact from exact passing commit; deploy that artifact through GitHub Actions. Report release commit, rules/content/schema versions and workflow links.

Run pre-deploy complete required checks. After deployment run browser smoke against actual Pages URL: assets/worker load, create match, submit/resolve turn, save/reload, input layout and version marker. Store traces/screenshots and deployment report. Post-deploy failure blocks declaring release successful; fix/retest or restore last known-good artifact if one exists.

**Review artifact:** live URL, test evidence and release notes; distinguish browser emulation from real iPad hardware evidence. Network multiplayer remains deferred.

## Review gates and reporting
For each stage report: scope completed, GitHub commit/PR, test commands/results, runnable demo or artifact, decisions/limitations and next stage. A failed required check means the stage remains open. No application implementation has begun with this document.

Plan approval authorises starting Stage0, then Stage1 after its documentation gate. The default is review between stages. The owner may instead authorise continuous execution with stage reports, retaining the same acceptance checks and GitHub records.
