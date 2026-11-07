# Spell Chaos — technical and interaction design

> **Approved scope change — 6 November 2026:** Goblin and Dragon are deferred in full to the next version. The MVP now has five summon families (Cat, Serpent, Spirit, Plant, Archer), 40 profiles, and the same 12 non-summoning spell families. This supersedes seven-family/56-profile MVP requirements below; historical profiles and rules remain preserved for later use. Starting spell guarantees use 14 non-guaranteed families.

> **Owner decisions — 7 November 2026:** (1) [SPECIFICATION.md](SPECIFICATION.md) is now the authoritative specification. The verbatim v0.9 source archive (PLAN Stage 0, `docs/SPECIFICATION-SOURCE-v0.9.md`) is no longer required; statements below that the original supplied text is authoritative, or that archiving it is a gate, are superseded. Where the register is silent or ambiguous, record an owner ruling as a numbered decision rather than appealing to the original source. (2) Development saves need no backward compatibility: legacy schema validators, migration functions and historical save fixtures may be deleted, and the schema may restart at version 1 for release. See the [Stage 1–7 review](reviews/2026-11-07-stage-1-7-review.md).

Version 0.1 · 2 November 2026 · **APPROVED by owner**

Approval: “Proposals are all good, proceed to plan.” All architecture, interface, verification proposals and decisions D01–D22 are accepted. Historical proposal wording below records the reviewed version; it no longer denotes pending approval. Implementation still requires approval of PLAN.md. The owner authorised planning now; full-source archival remains a pre-code gate in Stage 0.

## Review boundary and authority
This document proposes architecture, user experience and resolutions for remaining edge cases. It is not an implementation plan or permission to begin coding. Workflow: approve/revise this design → prepare and review a staged implementation plan → execute approved stages, committing code and verification evidence to GitHub.

The owner's supplied game specification v0.9 is authoritative. Its later MVP baseline supersedes earlier conflicts. [SPECIFICATION.md](SPECIFICATION.md) is a condensed requirements register with all 56 numeric profiles, not a verbatim replacement. Archiving the full supplied source remains an outstanding documentation requirement before implementation. No approved feature may be dropped because the register omits detail.

Locked game rules remain locked. Every proposed rule below needs approval as part of design review. Future features receive extension seams, not speculative implementations.

## 1. Experience and delivery
MVP is one human versus 1–7 AI wizards, simultaneous planning, on a 30×30 hex arena. All five retained summon families and 12 non-summoning families are part of the first complete playable release; an internal increment with fewer features is not the accepted MVP.

Proposed hosting: static GitHub Pages at /SpellChaos/, deployed through GitHub Actions after release checks. No backend or paid service is required for local AI play. A browser worker owns authoritative simulation; this is local authority for MVP, not a security boundary against the device owner. Future multiplayer moves the same headless engine behind a server; remote clients receive filtered views only.

TypeScript throughout. Proposed stack: pnpm workspace, Vite + React for application and accessible controls, Canvas2D for the board, Vitest for unit/scenario tests, fast-check for generated tests, Playwright for browser tests, Zod for external schemas. Pin versions and lockfile during the approved implementation plan. Native browser IndexedDB stores saves. No service worker in initial design, avoiding stale-code/content mismatches.

## 2. Module boundaries
| Module | Responsibility | Must not depend on |
| --- | --- | --- |
| domain | Plain state/command/event types and stable identifiers | UI, clock, randomness |
| geometry | Hexes, footprints, edges, rays, distances, areas | renderer |
| content | Versioned profiles, spells, traits and validation | browser |
| engine | Validation, reservations, resolution, damage, lifecycle | DOM, wall clock, animation |
| views | Per-player projection and redacted event projection | AI policy |
| ai | Orders from permitted observations | authoritative hidden state |
| persistence | Snapshot schemas, validation, migration, replay | live entity references |
| scenarios | Scripted setup, headless runs and fixtures | human input |
| app | Worker adapter, scheduling, UI, input, animation, storage | rule duplication |
| balance | Optional batch matchup runner and result export | alternative combat logic |

Dependencies flow toward domain/geometry/content. The engine is a versioned library runnable in Node and a browser worker. UI previews call engine validation/geometry over permitted data and display uncertainty rather than importing secret state. AI simulation, if added, constructs hypotheses from observations rather than cloning authoritative truth.

Proposed directories: packages/{domain,geometry,content,engine,views,ai,persistence,scenarios}, apps/web, tools/balance, tests/{integration,browser,fixtures}, docs/{decisions,traceability}. Avoid separate packages where they add build overhead without enforcing a meaningful boundary; the plan may group these as modules.

## 3. Authoritative data model
All state is JSON-safe explicit data; integers and stable IDs, no class instances, closures, native Map/Set, promises or browser handles.

GameState contains:
- match ID, schema/rules/content versions and content digest;
- turn, phase, planning status, engine cursor, command sequence and committed submission IDs;
- board dimensions, entities, corpses, edge walls, area effects and all stable-ID indexes;
- players, wizard identity, elimination, books, mana, reservations and missed-turn counts;
- creatures: profile ID, centre, height, controller, summoner, binding level, HP, damage provenance, conditions, holds, cooldown readiness, actions and creation turn;
- casts: caster/origin/target IDs, level, variant, start/completion phase, resource commitment, locked origins and interruption state;
- planning drafts, lock state, scheduled completions and reaction continuations;
- random stream states, phase tie keys, phase-order snapshots, event sequence and terminal result.

Data must represent a rider/mount pair separately while enforcing shared occupancy. Derived occupancy and sight caches are rebuilt from authoritative fields, never serialized as independent conflicting truth. Full snapshots include hidden data and are explicitly labelled private match exports.

Content definitions contain explicit attacks/components/ranges/properties, body classification, immunities, spell access, object/riding capability and ability IDs. Generic reusable ability handlers cover common rules; named exceptions such as False King have dedicated tested handlers. Do not build an unrestricted scripting language or encode arbitrary functions in content.

Validate all 56 preserved family/level data entries; require complete ability coverage for the 40 MVP entries. Check maxHP=Size×Con, range/targeting on every ranged action, legal trait references, caster caps and all ability implementations. Preserve distinctions such as Spirit physical exceptions, plant Int0, siege Move0, and multiattack versus alternate attacks.

## 4. Geometry and occupancy
Proposed representation: pointy-top odd-row offset display coordinates; convert to axial/cube integers for simulation. Flat-to-flat scale remains one metre. Radius footprint = floor((Size−1)/2). Board clipping is never allowed.

Canonical edge IDs are sorted neighbouring hex pairs, including boundary edge representation. Ray tracing returns crossed hexes and edges; sight, projectile obstruction and movement each interpret that trace with their own rules. Ordinary walls can block ground projectiles yet permit flight, while Energy remains exceptional.

Boundary rays retain the attacker's selected side in the command. Use deterministic rational/integer comparisons, not platform-dependent epsilon choices. Enumerate cube directions in a documented constant order. Sector-based flanking derives from relative centres, independent of facing.

Ordinary units cannot overlap, subject to mount, swarm, flight/transit, incorporeal and illusion/Int0 exceptions. Distinguish legal transit from legal endpoints. Movement resolves one step at a time inside a unit's complete-path turn, checking walls, footprints, restraint and Guard on each step.

Proposed spawn algorithm: enumerate the inset perimeter, distribute player slots at equal perimeter intervals from a seeded initial offset, then choose nearest unused legal anchors; store selected starts. This must be tested for 2–8 players and documented with a diagram before implementation.

## 5. Deterministic command and resolution protocol
Commands carry matchId, playerId, turn, commandId, expectedRevision, type and payload. Validate schema, authority, legal phase, resources and action budget transactionally. Reject stale, duplicate or conflicting submissions with stable error codes. Repeating an accepted command ID returns its recorded acknowledgement without applying it twice.

Draft revisions replace their reservations atomically. LockTurn freezes the player's complete orders; omitted units receive Total Defence. StartResolution occurs only after all locks or an explicit scheduler deadline command. Clock expiry is an input, not an engine read of Date.now(). A fake clock drives scheduling tests.

The engine exposes createMatch, validateCommand, applyCommand, advanceAtomicStep, projectView, encodeSnapshot and restoreSnapshot. Signatures are conceptual until planning. advanceAtomicStep returns new state plus structured events.

At each phase beginning, snapshot distances and sort keys; materialize random tie keys once, saving them. Separate ordinary and Slowed queues, then Quick completions. Revalidate state-dependent eligibility at execution without silently reordering the phase. Newly summoned units occupy immediately but fail eligibility until next turn.

Atomic boundaries include a completed movement step, an attack substep with persisted action accumulator, a resolved reaction, or a lifecycle batch. Pending continuations explicitly encode what follows. Multiattacks accumulate damage for one concentration test per action; saving between hits retains the accumulator. A reaction queue prevents UI recursion and allows exact mid-movement restore.

At turn end, freeze participants for each prescribed snapshot step. Damage is simultaneous within its step. Death cleanup includes illusion reversal and controller loss in a deterministic lifecycle batch before victory evaluation. Guard watches clear at next turn start; readyTurn values implement cooldowns without ambiguous decrement order.

Proposed RNG: documented, versioned 32-bit integer PRNG with explicit serialized state and known-answer vectors. Independent named streams for setup, resolution and AI avoid AI search changing combat rolls. Use unbiased bounded draws and stable enumerations. Balance uses integer half-points internally. Rational multipliers yield integer damage by explicit ceiling.

## 6. Damage, illusion provenance and lifecycle
Each damage application records target, source, attack action, components, final amount and illusion source if reversible. Conditions record provenance, potency, duration/expiry and hold linkage. Healing consumes oldest reversible damage before real damage. Illusion removal restores only remaining reversible loss on survivors and removes source-tagged conditions.

Permanent death has an explicit flag: reversal cannot resurrect a killed victim. An illusion can injure another illusion; removal cascades must be processed in stable batches without double restoration. Resistances, swarm exceptions and immunity are resolved before provenance recording. Zero damage cannot cause concentration or injected poison.

Binding and summoning ownership are different fields. Reanimation creates a derived undead profile preserving specified body capabilities and stripping banned ones. Corpse restoration availability and cumulative fire/acid exposure are authoritative data. No usable corpse is created for excluded categories.

Ongoing cast cancellation, familiar invalidation, displacement, damage concentration and elimination all use the same interruption path, with exactly-once mana/balance/lifecycle accounting.

## 7. Hidden information and AI
projectView(playerId) is the sole source of UI and AI data. It includes exact own information and only authorised enemy apparent species, public stats and health bands. It excludes enemy orders, exact HP/mana, illusion truth, hidden pending effects, RNG state and diagnostic provenance.

Redact structured events before presentation; do not send secret details and hide them in CSS. Logs, errors, accessibility text, previews and replay controls must obey the same projection. Detection knowledge is per player. Replays during a match retain that player's information boundaries; private authoritative debugging exports require an explicit separate action.

AI uses the same legal command interface and receives views frozen independently of other players' submitted orders. Proposed policy scores survival, damage, control, positioning, affordable summons and spell risk, with seeded variation. AI can infer illusions from visible clues but cannot inspect truth. Avoid exhaustive combinatorial search; bound candidates and operations per turn. Headless unbound behaviour uses perception and its prescribed different-species targeting, not the wizard policy.

Proposed tie for equally near independent targets: seeded random among legal perceived candidates. Unreachable target handling uses deterministic path search and fallback Total Defence if no legal progress.

## 8. Browser interaction design
Home: New match, Continue, Load save, Rules. New match chooses opponents, timer, difficulty and optional seed.
Desktop: board centre, roster/turn status left, selected-unit and spell controls right, phase log/replay below.
Phone: board fills available area, compact top status, expandable bottom sheet for unit/order/spell details; commit remains explicit and reachable. Tablet adapts panels without covering essential confirmation controls.

Creature tokens use species labels, colour plus player glyph, health band and clear selection rings. Large footprints show occupied outlines; zoom determines label density. No facing arrows. Distinguish planned movement, cast origin, target, impact and uncertainty.

Input uses Pointer Events for mouse/touch/pen. Tap selects; explicit Move/Target tools issue orders. Drag in navigation mode pans; pinch zooms; dedicated zoom buttons and pan mode provide alternatives. Mouse wheel is optional. Stylus needs no pressure. Essential functions never require long press, hover or right-click.

Order flow: select → choose movement path/action → choose early/late → inspect preview → save draft → commit whole turn. Preview reports cost, range, visible risks and known blockers, not secret opponent plans. A cast preview shows level, summon variant, origin and estimated success at current balance; explain that resolution balance may change. Local Undo changes draft only.

Resolution controls: pause, one event/phase step, speed, log jump. Animation is a consumer of engine events; skipping it cannot alter results. Accessible DOM roster and inspection support essential interaction independent of tiny canvas hit targets. Target controls at least44 CSS pixels, keyboard optional, text scaling and colour-independent status.

## 9. Persistence and future remote play
Snapshots have schemaVersion, rulesVersion, contentVersion, contentHash, match metadata and authoritative state. Validate the entire decoded candidate before replacing a running match, including reference integrity, resource bounds, phase/cursor consistency and version compatibility.

Support planning drafts and every published atomic boundary. Pause timing is session metadata: save remaining planning duration and restore through the scheduler; deterministic engine continuation depends on the same subsequent deadline commands.

IndexedDB autosave at committed turn boundaries and selected atomic checkpoints; explicit downloadable JSON save. Replays store initial snapshot plus ordered commands, version pins and verification hashes, with periodic snapshots for seeking. Events are derived and checked against hashes, not trusted to mutate state.

Schema migrations are explicit pure transformations with frozen fixtures. Do not silently run old rules on new content. Unsupported rules/content versions produce a clear error until a compatibility package or approved migration exists. Future server command envelopes already contain match/player/turn/revision/idempotency IDs.

## 10. Verification and release design
Every requirement receives stable IDs grouped by geometry, orders, spells, conditions, abilities, visibility, saves and workflows. A machine-readable traceability register links source section, interpretation decision, scenario/test IDs and implementation status. Every enabled spell level and all 40 MVP profiles require behavioural coverage; all 56 preserved profiles retain data validation; named edge cases need explicit expected outcomes rather than snapshots alone.

Required suites:
- Unit mathematics/geometry/schema/content and named ability tests.
- Headless expected-outcome scenarios across phases, reactions, casting, damage, illusion reversal and elimination.
- Generated command sequences asserting legal occupancy, bounded resources, permanent elimination and determinism.
- Encode/decode plus fresh-instance continuation at every atomic boundary, including pending multiattacks/reactions and tie breaks.
- Integration worker/projection/save/scheduler tests, with hidden-state non-disclosure checks.
- Playwright full match, touch/mouse/pen workflows, narrow layouts, pan/zoom, revision, preview, commit, pause/step and save/load.
- Deterministic screenshot fixtures, operation/performance budgets and long simulations with seeds/commands retained.

Proposed browser baseline: current Playwright-pinned Chromium, Firefox and WebKit; mobile viewport/touch emulation, plus pen Pointer Event tests. Emulation does not prove physical iPad hardware behaviour; record that limitation and add actual-device smoke evidence when available.
Proposed thresholds for review: engine branch coverage90%, lines95%, with 100% requirement traceability for implemented scope. Thresholds supplement semantic coverage, never substitute for it.

Proposed performance targets: p95 visible-input response under100ms; normal frame work under16.7ms; bounded simulation step under50ms on documented reference environment. No creature cap is added: benchmark 64/256/1024 creatures, partition expensive work at deterministic boundaries, report growth and practical memory limits. CI timing uses calibrated runners and tolerance; deterministic operation budgets avoid noisy false failures.

CI: typecheck/content validation/unit/scenario/save regression on every change; browser/visual/integration gates on PRs; seeded soak and optional full matchups on schedules/manual runs. Release requires all required suites on the exact commit. Retain failure seeds, snapshots, traces/screenshots and logs; rerun commands documented.

Optional balance mode uses the production engine, all820 unordered pairings including mirrors for40 MVP profiles, repeated trials with swapped sides. No wizard-elimination shortcut: a dedicated scenario victory policy scores the duel without changing combat rules. Output JSON/CSV matrix, Wilson win-rate intervals, draws/failures separately, turns/remainingHP and full scenario/policy/version metadata. Trials terminate with configurable turn and operation limits.

## 11. Proposed decisions requiring review
These resolve open details, not changes to approved mechanics.

| ID | Question | Proposed decision |
| --- | --- | --- |
| D01 | Marked Quarry | Select as an action; remains until target dies. Selecting another target costs an action and replaces the mark. |
| D02 | Basilisk restraint | Magical restraint lasts2 turns; Escape uses Int resistance against5. Existing Slowed retains its own expiry. |
| D03 | Shade Chill / Wither | On damaging hit, Int resistance versus listed potency; no extra action; duration as listed. |
| D04 | Banshee Wail | All other creatures in radius3; separate Dex resistance versus6 for half5 magic damage; separate Int6 Fear on living susceptible targets; cooldown3. |
| D05 | Ballista penetration | Continue same ray to first creature directly beyond initial footprint; separate hit roll, half listed base damage rounded up before defence; initial miss still permits second roll. Maximum two targets. |
| D06 | Special ranged attacks | Spark, Hex, Crownfire and poison spit are direct intercepted projectiles. Breath uses its own line and hits all intersected creatures. |
| D07 | Swarm major vulnerability | Replace generic swarm fire vulnerability with stronger explicit MVfire, do not multiply twice. Area-only remains1.5; physical area ignores physical resistance. |
| D08 | Rally | Multiple allied sources grant a single+1 Skill; inactive sources do not contribute; no self bonus. |
| D09 | Automatic effects | Defend modifies hit rolls only. It does not reduce auto-hit damage or grant resistance advantage. |
| D10 | Empty-hex direct shots | Allowed to target visible empty ground within range; intercept first eligible creature on ray, including unseen ones, without leaking occupancy in preview. |
| D11 | Ordinary nearest-legal ties | Minimum cube distance then canonical coordinate order; explicitly random cases such as False King retain seeded random ties. |
| D12 | No legal dismount on death | Rider dies if no legal placement exists; explicit event and test. Voluntary dismount into no legal space is rejected. |
| D13 | Resistance advantage | Roll effect success twice; advantage on defender resistance chooses the roll causing failure. Crit remains independent. |
| D14 | Expiry/victory | Perform extra lifecycle/victory check after expiry, before mana/awards; no rewards after terminal result. |
| D15 | Starting book | Draw from 14 non-guaranteed enabled families; uniformly choose valid10-family subsets satisfying category guarantees. Damage={Magic Bolt,Fire Bolt,Magic Attack}; utility={Healing Bolt,Teleport,Wall,Tangleweed,Darkness,Reanimate}. |
| D16 | Auto-illusion balance | Successful illusion casts shift balance by family alignment×L, following the general success rule. |
| D17 | Revealed blocked invisible hex | Reveal to discovering player through end of current phase; contact does not grant global visibility. |
| D18 | Early Aim | Early attack receives Aim only with zero movement order and no actual movement that turn; later forced movement cannot retroactively change resolved damage. |
| D19 | Gryphon/Hydra multiattacks | Gryphon's beak and claws are one action; Hydra/Dragon bite targets explicitly planned in order, invalid subtargets waste that subattack. |
| D20 | Spell-origin invalidation | Locked familiar voluntary movement is rejected until completion/cancellation; forced displacement interrupts, as does the specified death/incapacity/control loss. |
| D21 | Tangleweed escape | Escape action physical resistance againstL; success releases that restraint, subsequent entry may retry subject to once-per-turn attempt limit. |
| D22 | Reanimated default binding | Binding level equals Reanimate level; later control uses ordinary rules; creature-equivalent level remains original. |

Other unresolved details encountered during implementation must enter a decision record before coding behaviour. Do not silently treat a proposed ruling as a locked rule. In particular, wall/area boundary geometries, grapple reach, spell-origin footprint ray selection and condition duration counting need explicit examples in the plan's acceptance scenarios.

## 12. Review checklist and next gate
Review architecture/hosting/input approach, proposed edge-case rulings, browser/performance targets and optional simulator inclusion. Record accepted/revised decisions and design version. Complete verbatim source archival. Only then prepare the separate staged plan with dependencies, deliverables, tests, traceability and review gates. No application code, deployment or implementation workflow is created at this design stage.
