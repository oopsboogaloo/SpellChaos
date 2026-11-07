# Remote asynchronous play — build specification

Status: **draft v0.2: owner decisions recorded; requirements ready for review** · 7 November 2026
Basis: [FEASIBILITY.md](FEASIBILITY.md), [SPECIFICATION.md](../SPECIFICATION.md) (authoritative rules), [DESIGN.md](../DESIGN.md)

Requirement IDs (`REM-nnn`) are stable so that traceability and tests can cite them. "Must" is required for the first release of remote play; "should" is desirable; anything listed as an open decision (§13) needs an owner ruling before it is built.

## 1. Purpose and scope

Let friends play Spell Chaos remotely and asynchronously. Each player submits private orders. The turn resolves when every order is in, or when the deadline passes, and each player then watches their own filtered resolution.

**In scope**
- Create a game, share a code, join it, and wait in a lobby.
- Seat humans and AI wizards.
- Draft and lock orders asynchronously across days.
- Turn deadlines and missed-turn rules.
- Resolution on the server.
- Per-player replay of each turn.
- Notifications.
- Leaving and conceding.
- Game end and data retention.

**Out of scope (REM-001)**
- Matchmaking, public lobbies and game browsing.
- Ratings and rankings.
- Friends lists and accounts with passwords.
- In-game chat or messaging. Players already talk wherever they found each other.
- Spectators.
- Real-time (synchronous) play modes.
- Paid features.

Fairness stance (REM-003, owner decision 7 November 2026): this is a casual game among friends. Preventing players who modify the client or call the API directly from cheating is **not a goal**. The server still sends each player only their own view, so ordinary play never spoils hidden information, but no anti-cheat hardening is required.

Safeguarding stance (REM-002): the service never introduces strangers to each other. The only user-generated text other players can see is a display name scoped to one game. Personal data is limited to an optional notification email.

## 2. Architecture summary

Chosen stack (owner decision D-R9, 7 November 2026; [FEASIBILITY.md §5](FEASIBILITY.md#5-recommended-architecture)):
- The static client on GitHub Pages.
- A Cloudflare Worker API.
- One Durable Object per game (SQLite storage, alarms, WebSockets).
- A small directory object for join codes.

Requirements:
- **REM-010:** The server is authoritative. Clients never receive `GameState`, snapshots, RNG state or another player's orders. They receive only `projectView(state, playerId)`, `projectEvents(...)` and the metadata defined here.
- **REM-011:** The server runs the same `engine`, `views` and `persistence` modules as the client, built from the same commit. There is no rule logic in server code.
- **REM-012:** All commands to one game are applied one at a time, in arrival order, by that game's single writer.
- **REM-013:** Server code depends on a `GameStore` / `Scheduler` / `Notifier` interface, so the hosting provider can be replaced without touching game logic.

## 3. Game lifecycle

```
LOBBY ──start──► ACTIVE ──victory/draw──► FINISHED ──retention expiry──► DELETED
  │                │
  └─cancel/expiry──┴─host cancel (all humans agree) ──► CANCELLED ──► DELETED
```

### 3.1 Create (REM-020)

A host creates a game and chooses:

| Setting | Values | Default |
| --- | --- | --- |
| Seats | 2–8 total | 4 |
| AI seats | 0 to seats − 2, so at least 2 humans | 0 |
| AI difficulty | per the Stage 8 levels | Normal |
| Turn deadline | none, 12 h, 24 h, 48 h, 72 h, 7 days | 24 h (D-R6) |
| Missed-turn surrender | on (3 consecutive, per the specification) / off | on |
| Host approval for joiners | on / off | on |

- The server chooses the seed (REM-021). The seed is never shown to players until the game is finished.
- The host receives a host seat token and the join code.

### 3.2 Join (REM-030 – REM-035)

- **REM-030:** The join code is 8 characters of Crockford base32 (about 40 bits), shown as `XXXX-XXXX`. It is case-insensitive and ignores the confusable characters I/L/O/U.
- **REM-031:** The code only admits players to open seats while the game is in LOBBY. It stops working at start, at cancellation, or 7 days after creation.
- **REM-032:** The joiner enters a display name of 1–24 characters. Control characters are stripped, the name must be unique within the game, and a basic profanity check runs on the server.
- **REM-033:** With host approval on, a joiner waits as *pending* until the host admits or rejects them. Rejected joiners cannot retry with the same code.
- **REM-034:** The host can regenerate the code, which invalidates the old one, and can remove players while the game is in LOBBY.
- **REM-035:** Join attempts are rate-limited per IP address, for example 10 per minute. Repeated wrong codes from one address are blocked temporarily.

### 3.3 Start (REM-040)

- The host starts the game once at least 2 humans are seated. Empty seats are removed, unless the host chooses to fill them with AI.
- The server creates the match with `createMatch` and assigns wizard colours and spawn order.
- The game moves to ACTIVE at turn 1, planning.

### 3.4 End (REM-050)

- A game finishes on the engine's terminal result (victory or draw).
- Every player can then:
  - see the final state;
  - replay every turn from their own perspective;
  - replay every turn with the full authoritative truth (illusions, invisible and hidden units). This is always available once the game is over; it is not a setting (D-R5).
- The game is deleted 30 days after it finishes (REM-051).
- **REM-055:** A game that reaches the end of turn 200 without a result ends in a draw (D-R6).

### 3.5 Leaving

- **REM-052:** A player may concede at any time. This is the engine's surrender, with the same death-cleanup rules.
- **REM-053:** Cancelling an ACTIVE game requires every remaining human to agree.
- **REM-054:** A LOBBY with no activity for 7 days expires.

## 4. Identity and access

- **REM-060:** There are no accounts. Joining issues a **seat token**: 256 random bits, returned once and stored by the client in local storage. The server stores only a SHA-256 hash.
- **REM-061:** Every request carries the token in an `Authorization` header. The server derives `matchId` and `playerId` from the token and ignores any client-supplied identity.
- **REM-062:** The host token also permits host actions: approve or reject joiners, regenerate the code, start, remove players in the lobby, and propose cancellation. The host plays like any other seat; there is no admin view of hidden state.
- **REM-063 (device transfer):** A player can show a *seat link* (URL plus QR code) containing their token, to continue on another device. Opening it stores the token. Both devices stay valid unless the player chooses "sign out other devices", which rotates the token.
- **REM-064:** A seat whose token is lost cannot be recovered by the server itself. The host may issue a replacement seat link mid-game only when every other human seat agrees; issuing it invalidates the old token (D-R2).
- **REM-065:** Tokens and seat links must never appear in URLs that are logged server-side, or in analytics. Seat links put the token in the URL fragment (`#…`) so it is never sent to the server.

## 5. Turn flow

### 5.1 Planning (REM-070 – REM-075)

- **REM-070:** At turn start, the server records `planningOpenedAt` and `deadlineAt` (none, or opened-at plus the game's deadline setting), then notifies players (§8).
- **REM-071:** Drafts are stored on the server, through the engine's `SetOrder` / `ClearOrder`, so a player can continue on another device. Draft contents are visible only to their owner (REM-010).
- **REM-072:** **Lock is final for the turn.** This follows the specification: "Revise until lock/deadline." There is no unlock (D-R3).
- **REM-073:** Each player's view shows which players have locked, and how long remains, as "waiting for N players". This is public metadata, not a secret.
- **REM-074:** AI seats compute and lock their orders at the start of each turn, using only `projectView` for their own seat and the AI RNG stream (DESIGN §7; requires [#24](https://github.com/oopsboogaloo/SpellChaos/issues/24)).
- **REM-075:** Eliminated players are already locked by the engine and receive views, but they can no longer act.

### 5.2 Trigger

- **REM-080:** When the last non-eliminated human locks, the server issues `StartResolution` in the same serialised step. This happens exactly once, because commands are serialised (REM-012).
- **REM-081:** When `deadlineAt` passes, the alarm issues `DeadlineReached`. The engine gives unlocked units Total Defence and counts missed turns. With missed-turn surrender on, the third consecutive miss surrenders the player, per the specification. With it off, the counter is not applied; this needs a small engine option.

### 5.3 Resolution

- **REM-090:** Resolution runs `advanceAtomicStep` repeatedly. The state is persisted after each chunk, and a chunk ends when either 500 steps or 5 s of CPU is reached, whichever comes first.
- **REM-091:** If a chunk ends before the turn is complete, the server sets an immediate alarm to continue. A crash or redeploy mid-turn resumes from the last persisted step with identical results; the engine's existing restore-at-every-boundary tests guarantee this.
- **REM-092:** Commands that arrive during resolution are rejected with `RESOLVING`, except for read requests.
- **REM-093:** When the turn completes, the server stores the turn record (§7) and the next planning state, then notifies players.

### 5.4 Viewing the result

- **REM-100:** Each player can replay any completed turn as an ordered list of their projected events, plus a projected view before and after the turn. Animation is driven by these events, as in DESIGN §8.
- **REM-101:** A player who opens the game after several turns have resolved can step through the missed turns in order, or skip straight to the current planning view.

## 6. Engine changes required

These are changes to the shared engine. Most are already tracked by issues from the review.

| ID | Change | Issue |
| --- | --- | --- |
| REM-110 | Per-player draft revision exposed in that player's view; `expectedRevision` checked against it | [#17](https://github.com/oopsboogaloo/SpellChaos/issues/17) |
| REM-111 | Idempotency keyed on `(playerId, commandId)`; bounded accepted-command history | [#17](https://github.com/oopsboogaloo/SpellChaos/issues/17) |
| REM-112 | No planning-time validator or error code reveals hidden state | [#15](https://github.com/oopsboogaloo/SpellChaos/issues/15) |
| REM-113 | Movement events and contact reveals don't leak | [#16](https://github.com/oopsboogaloo/SpellChaos/issues/16) |
| REM-114 | ReleaseHold / CancelCast take effect at resolution, not during planning | [#18](https://github.com/oopsboogaloo/SpellChaos/issues/18) |
| REM-115 | Independent setup / resolution / AI RNG streams | [#24](https://github.com/oopsboogaloo/SpellChaos/issues/24) |
| REM-116 | Snapshot content hash, and typed load errors | [#29](https://github.com/oopsboogaloo/SpellChaos/issues/29) |
| REM-117 | Missed-turn surrender configurable per match (off = no auto-surrender) | new |
| REM-117a | `Concede` player command that calls the existing `surrender` path | new |
| REM-118 | Malformed commands rejected with a stable code (`MALFORMED_COMMAND`), never a raw parser error | [#29](https://github.com/oopsboogaloo/SpellChaos/issues/29) |
| REM-119 | A view-based validation helper, so the client can preview orders using only its own view | new |

Specification amendment (REM-120): SPECIFICATION.md currently says "90-second planning default, configurable/disabled privately". It needs to add the remote deadline options from §3.1. Planning time is a scheduler input, so the rules engine does not change.

## 7. Server data model

All of this lives in the game's own storage; the directory holds only join codes.

| Table | Contents |
| --- | --- |
| `meta` | game id, status, settings, engine/rules/content versions and content hash, created/started/finished times, `deadlineAt` |
| `seats` | playerId, display name, kind (human/AI), token hash(es), host flag, status (pending/seated/conceded), optional email, last-seen time |
| `snapshot` | current `encodeSnapshot` text (one row, replaced atomically together with the command log entry) |
| `turns` | turn number, snapshot at planning start, raw engine events for the turn (with emission-time audiences) |
| `commands` | append-only log: sequence, playerId, command JSON, accepted/rejected code, time |
| `push_subs` | playerId, Web Push subscription (endpoint and keys) |

- **REM-130:** The current snapshot and the command log are written in the same transaction.
- **REM-131:** Raw events are stored once. They are projected per player at read time, using the audience captured when they were emitted. Per-player copies are never stored.
- **REM-132:** Storage per game should stay under 20 MB at 200 turns (about 86 KB per snapshot today).

## 8. Notifications

- **REM-140:** While the game page is open, a WebSocket delivers "something changed" pings. The client then re-fetches its view. Pings carry no game data.
- **REM-141:** Web Push is opt-in per seat, after a user tap. The client registers a **push-only service worker** with no caching (D-R1). The client explains the iOS Home Screen requirement.
- **REM-142:** Email notification is included in the first release (D-R10). It is optional and per seat, entered by the player, double-opt-in, and deleted when the game is deleted. Content is limited to a game name, an event and a link; there is no game state.
- **REM-143:** Notification triggers:
  - you were admitted, or the game started;
  - a new turn is open;
  - a reminder 2 hours before the deadline, if you haven't locked;
  - a turn resolved;
  - the game is over;
  - a cancellation was proposed.
- **REM-144:** Players can mute notifications per game and choose daily-digest email instead of per-event email.

## 9. Versions and deployment

- **REM-150:** Each game records the engine, rules and content versions and the content hash at creation. The server refuses to load a game whose versions it cannot run.
- **REM-151:** Version policy (owner decision §13 D-R4):
  - **Default proposal:** the server bundle keeps every rules/content version that still has active games, keyed by version. The 64 MiB Worker limit allows many. A version is dropped once its last game ends.
  - During development, before release, active test games may simply be ended on a breaking change. This follows the owner decision of 7 November 2026 that old saves need no compatibility.
- **REM-152:** A staging environment and a production environment are deployed from GitHub Actions using Wrangler. Production deploys only from a tagged, green commit. Secrets (VAPID keys, email API key) are held in the platform's secret store, never in the repository.
- **REM-153:** The client shows a "server updated — reload" banner when the API reports a newer client build than the one running.

## 10. API

All requests are JSON. Every endpoint except create and join requires `Authorization: Bearer <seat token>`.

| Method and path | Purpose | Returns |
| --- | --- | --- |
| `POST /api/games` | Create; body is the settings and host display name | game id, join code, host token |
| `POST /api/join` | `{code, displayName}` | seat token, game id, status (pending/seated) |
| `GET /api/games/:id` | Lobby or game metadata: seats (names, locked/waiting), status, deadline | metadata |
| `POST /api/games/:id/lobby` | Host actions: admit, reject, remove, regenerate code, start, add AI | metadata |
| `GET /api/games/:id/view` | `projectView` for this seat, plus own revision and turn | view |
| `POST /api/games/:id/commands` | Engine command (`SetOrder`, `ClearOrder`, `LockTurn`, `CancelCast`, `ReleaseHold`, `Concede`); server fills `matchId`/`playerId` | `{ok, revision}` or `{error: CODE}` |
| `GET /api/games/:id/turns/:n` | Projected events, plus before/after views, for turn n | replay |
| `POST /api/games/:id/push` | Register or remove a Web Push subscription | ok |
| `POST /api/games/:id/seat/rotate` | Rotate the token (sign out other devices) | new token |
| `POST /api/games/:id/cancel` | Propose or agree to cancellation | metadata |
| `GET /api/games/:id/live` (WebSocket) | Change pings | — |

- **REM-160:** Every error is a stable code from a published list. The same code is returned for "hidden" and "doesn't exist" wherever the distinction would leak.
- **REM-161:** Request bodies are capped at 64 KB, and every body is validated with the engine's Zod schemas before use.
- **REM-162:** Rate limits are applied per token and per IP address: commands 60/min, reads 120/min, join 10/min.

## 11. Security and spoilers

Per REM-003, the aim is to avoid **spoilers in ordinary play** and to protect the service and players' data. It is not to defeat cheaters.

- **REM-170:** The client receives only projected data (REM-010). Tests check that the normal screens, messages and replays of one player never reveal another player's secrets: two server states that differ only in a secret produce the same view for every other seat.
- **REM-171:** Out of scope: deliberate probing of the API, timing side-channels, modified clients and tampering with local data. No hardening is built for these.
- **REM-172:** AI seats use the same command interface and see only their own view.
- **REM-173:** Seat tokens are compared in constant time. Hashes are stored, not tokens.
- **REM-174:** Logs record command types and error codes, but not command bodies, tokens or emails.
- **REM-175:** A privacy notice states what is stored (display names, optional email, push endpoints and game data), why, and for how long.

## 12. Client changes

- **REM-180:** The web app gains an "Online" area: create, join with a code, my games (stored tokens), lobby, game, and replay.
- **REM-181:** Online games use only server-provided views. The client may run the engine locally only for view-based previews (REM-119), never on authoritative state.
- **REM-182:** "My games" lists every stored seat, with status badges (your turn, waiting for others, resolved, finished).
- **REM-183:** Offline and local play against AI is unchanged and works without the server.
- **REM-184:** Input, accessibility and layout requirements from DESIGN §8 apply to all online screens.

## 13. Owner decisions

All decided 7 November 2026.

| ID | Question | Decision |
| --- | --- | --- |
| D-R1 | DESIGN says no service worker; Web Push needs one | **Allowed:** a push-only service worker with no caching. This amends DESIGN §1 for remote play. |
| D-R2 | Can the host reissue a lost player's seat link mid-game? | **Yes,** with the agreement of every other human; the old token is invalidated (REM-064) |
| D-R3 | Can players unlock a locked turn? | **No:** locking in is final for the turn (REM-072) |
| D-R4 | How long must old rules versions keep running for games in progress? | Until the last game on that version ends, with a 90-day cap; after that the game is cancelled (REM-151) |
| D-R5 | After a game ends, reveal the full replay (illusions, hidden units) to everyone? | **Yes, always.** It is not a setting (REM-050). |
| D-R6 | Default deadline and the maximum game length | **24 h default; 200-turn cap ending in a draw** (REM-020, REM-055) |
| D-R7 | Can a player hold several seats in one game? | **No:** one seat per person (REM-030 – REM-033) |
| D-R8 | Can AI replace a player who conceded or timed out? | **Not in the first release.** Highly desirable for a later version. |
| D-R9 | Hosting provider | **Cloudflare Workers Paid + Durable Objects** (FEASIBILITY §4). Self-hosting was considered and declined. |
| D-R10 | Email notifications in the first release? | **Yes:** email and Web Push (REM-141, REM-142) |

### Later versions

- AI takes over the seat of a player who concedes or times out (D-R8).

## 14. Verification

- **REM-190:** Server integration tests run on the platform's local runtime (for Cloudflare, Miniflare / the Workers Vitest pool). Covered: create/join/lobby rules, code expiry, host approval, start, every command path, last-lock trigger, deadline trigger, missed-turn surrender on/off, concede, cancel, victory, retention deletion.
- **REM-191:** Concurrency: simultaneous last locks trigger exactly one resolution, and a command during resolution is rejected.
- **REM-192:** Crash safety: kill or restart the game object at every chunk boundary of a recorded game; the final state and every player's events must be identical to an uninterrupted run.
- **REM-193:** Spoiler checks (REM-170) for the views, events and error messages the client actually shows, plus a generated-command property test over random games.
- **REM-194:** Playwright end-to-end tests with three browser contexts: create, join, approve, plan, lock, resolve, replay, and a deadline pass using a fake clock; on phone and desktop viewports.
- **REM-195:** Load test: 50 concurrent games with 8 seats each, through a full turn, within plan limits; record CPU per turn.

## 15. Delivery plan

The remote work depends on the engine prerequisites in §6. It can start in parallel with Stages 8–9, because it uses the engine's API, not the UI.

| Step | Scope | Exit criteria |
| --- | --- | --- |
| R0 | Engine prerequisites REM-110–119 merged (owner decisions in §13 are complete) | Issues closed; leak properties pass at engine level |
| R1 | `apps/server` skeleton, `GameStore`/`Scheduler` interfaces, Cloudflare adapter, create/join/lobby, staging deploy | REM-020–054 tests pass on staging |
| R2 | Commands, last-lock and deadline triggers, chunked resolution, turn records, views and replay endpoints | REM-070–101, 130–132, 190–192 pass |
| R3 | Client Online area: lobby, game and replay screens against staging | REM-180–184; Playwright 3-player flow passes |
| R4 | Live pings, Web Push, email, reminders | REM-140–144 |
| R5 | AI seats (needs Stage 8) | REM-074, REM-172 |
| R6 | Hardening: spoiler checks, rate limits, privacy notice, load test, production deploy | REM-160–175, 193–195; production smoke test |
