# Remote asynchronous play — technology feasibility

Status: **draft for owner review** · 7 November 2026 · Companion: [REMOTE-PLAY-SPEC.md](REMOTE-PLAY-SPEC.md)

> **Owner decision — 7 November 2026:** a server is required, because asynchronous play needs somewhere to store orders and resolve turns while players are offline. Protection against players who modify the client to cheat is **not a goal**: the game is played for fun among friends. The server still sends each player only their own view, so ordinary play never shows spoilers, but no anti-cheat hardening is built.
>
> **Owner decision — 7 November 2026:** host on **Cloudflare Workers Paid + Durable Objects** (§5). Self-hosting on a VPS or personal web space was considered and declined because of the ongoing maintenance it needs.

## 1. Question

Can Spell Chaos support remote, asynchronous, turn-based games between friends, with these properties?

- Players join a game by sharing a code. There is no matchmaking.
- Every player submits orders privately.
- The turn resolves once all orders are in, or at a deadline.
- Each player then watches the resolution as their own filtered view.

Which hosting approach should be used?

## 2. Answer

**Yes, it is feasible, and the engine is already well shaped for it.** It is a headless, deterministic TypeScript library with explicit commands, resumable atomic steps and per-player projections. DESIGN §1 already anticipated this: "Future multiplayer moves the same headless engine behind a server; remote clients receive filtered views only."

**Recommendation:**
- **Cloudflare Workers + Durable Objects** on the Workers Paid plan (US$5/month minimum), with one Durable Object per game.
- The static client stays on GitHub Pages as planned.
- **Fallback:** Convex, or a small self-hosted Node + SQLite server, both behind the same thin server interface.

**Prerequisites before remote play:**
- Fix per-player revisions ([#17](https://github.com/oopsboogaloo/SpellChaos/issues/17)). Without this, simultaneous players keep rejecting each other's commands as stale.
- Fix the RNG streams ([#24](https://github.com/oopsboogaloo/SpellChaos/issues/24)) before AI seats run on the server.
- Fix the hidden-information issues from the Stage 1–7 review ([#15](https://github.com/oopsboogaloo/SpellChaos/issues/15)–[#19](https://github.com/oopsboogaloo/SpellChaos/issues/19)). These are spoilers, not cheating risks: an honest player sees an ordinary message such as "can't summon there" that gives away a hidden creature.

## 3. Constraints that decide the architecture

### 3.1 Why a server resolves the turns

The deciding reason is **asynchrony**:
- Players are rarely online at the same time, so something must store each player's orders until the last one arrives, and store the result until each player returns. Two browsers cannot exchange data unless both are open, so a stored relay is unavoidable.
- If one player's device resolved the turn, the game would stall after the last lock until that player opened the app. A server resolves immediately, or at the deadline, with nobody online.
- Once the relay exists, running the engine on it costs almost nothing extra (§3.2).

The secondary reason is **hidden information**. Spell Chaos has persistent secrets, not just hidden orders: illusion truth, invisible creatures, Darkness occupants, exact HP and mana, and hidden corpses. Whichever device resolves a turn holds all of them, so a host-resolved game would show the host everything. Deliberate cheating with a modified client is out of scope by owner decision; what matters is that ordinary play does not spoil the bluffing.

Rejected alternatives:
- **Peer-to-peer or host-resolved play:** stalls on the host, and the host's device holds every secret.
- **Commit–reveal of orders:** hides orders only; whoever resolves still holds every other secret.

**Conclusion:** a server holds the authoritative state, runs the engine, and sends each player only `projectView` and `projectEvents`.

### 3.2 Measured engine cost

Measured on this repository at `6776411` (Node 22, cold process, `tests/fixtures/mounts-v26-full-roster.json`: 2 players, 42 creatures, all 40 MVP profiles acting):

| Operation | Result |
| --- | --- |
| Restore snapshot | 20–34 ms |
| Resolve one full turn | 279 atomic steps, ~300 ms CPU, 254 events |
| Encode snapshot | 9 ms; 86 KB |
| Project views and events for all players | 16–28 ms |

For larger battles, the Stage 1–7 review measured one movement turn at 3.6 s for 258 creatures and about 150 s for 900 ([#33](https://github.com/oopsboogaloo/SpellChaos/issues/33)).

Consequences:
- Any host with a per-request CPU cap of tens of milliseconds is ruled out. Restoring the snapshot alone exceeds 10 ms.
- Resolution can be split across invocations at atomic-step boundaries. Every step is already a saveable, resumable point, so hosts with caps of 1–2 s are workable with chunking.
- Storage is small: about 86 KB per turn snapshot, so a 100-turn game with every turn retained is under 10 MB.

### 3.3 Serialising commands per game

Several players can submit or lock simultaneously, and "last player locks" must trigger resolution exactly once. Each game therefore needs a single-writer guarantee. That means a per-game actor, a database transaction with row locking, or conditional writes.

### 3.4 Waking up without players

Deadlines must fire, and resolution must continue, while nobody is connected. The host needs durable timers or scheduled jobs.

### 3.5 Telling players it is their turn

Asynchronous play needs out-of-app notification:
- **Web Push:** works on desktop and Android browsers. On iOS and iPadOS 16.4+ it works only after the web app is added to the Home Screen, and the permission prompt needs a user tap. [pushpad], [OneSignal]
- **Email:** an optional fallback.

Either needs a service worker for push. DESIGN §1 currently says "No service worker in initial design", so this needs an owner decision (see the spec, §13).

## 4. Options compared

Pricing and limits come from vendor documentation retrieved by search on 7 November 2026. Direct page fetches were blocked in this session, so confirm figures on the vendor pages before committing.

| Option | Runs the TS engine | CPU per call | Per-game serialisation | Timers | Live updates | Indicative cost at hobby scale | Main risks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Cloudflare Workers + Durable Objects** | Yes (V8; the engine already bans `node:` imports) | Free: 10 ms. Paid: 30 s default, up to 5 min. [cf-limits] | One single-threaded object per game with built-in SQLite. [cf-do] | Durable Object alarms | WebSockets with hibernation (idle objects are not billed for duration). [cf-do-limits] | Paid: $5/month minimum, includes 10M requests and 30M CPU-ms per month. Durable Objects include 1M requests and 400,000 GB-s per month. [cf-pricing] | Vendor lock-in; 128 MB memory |
| **Supabase** (Postgres + Edge Functions) | Yes (Deno) | 2 s CPU, 150 s wall clock on Free. [supa-fn] | Postgres transactions and row locks | Postgres cron (pg_cron) | Realtime; Free allows 200 concurrent connections. [supa-rt] | Free projects pause after 1 week of inactivity, which breaks slow async games, so Pro ($25/month) is effectively required. [supa-rt] | Chunking needed for big turns; 2 s cap |
| **Firebase** (Firestore + Cloud Functions 2nd gen) | Yes (Node) | Up to 60 min for HTTP functions. [fb-quota] | Firestore transactions | Scheduled / task-queue functions | Firestore listeners; FCM for push | Requires the Blaze plan. No-cost tier: 2M invocations, 400K GB-s, 200K CPU-s per month. [fb-quota] No hard spending cap. | Billing surprises; cold starts |
| **Convex** | Yes (V8 / Node) | Queries and mutations 1 s of user code; actions up to 10 min. [convex] | Transactional mutations | Scheduled functions | Reactive queries | Free tier ~1M function calls per month (third-party figure; verify). | 1 s mutation cap forces chunking; actions aren't transactional; lock-in |
| **AWS** (Lambda + DynamoDB + EventBridge + API Gateway WebSockets) | Yes (Node) | Up to 15 min | DynamoDB conditional writes | EventBridge Scheduler | API Gateway WebSockets | Always free: Lambda 1M requests and 400,000 GB-s per month; DynamoDB 25 GB (provisioned mode). [aws-free] | Most moving parts; most configuration |
| **Self-hosted Node + SQLite** (VPS or Fly.io) | Yes | Unlimited | In-process queue per game | In-process timers plus a database | WebSockets | Fly.io has no free tier for new accounts (trial only). [fly] A small VPS is a few dollars a month. | You run patching, TLS, backups and uptime |
| **Client-only / peer-to-peer** | — | — | — | — | — | Free | **Rejected:** cannot keep hidden information (§3.1) |

### Scoring

Scores are out of 5; higher is better.

| Criterion (weight) | Cloudflare DO | Firebase | Supabase | Convex | AWS | Self-host |
| --- | --- | --- | --- | --- | --- | --- |
| Fit with the engine and its hidden-information model (3) | 5 | 4 | 4 | 4 | 4 | 5 |
| Correctness under concurrent locks (3) | 5 | 4 | 4 | 5 | 4 | 4 |
| Timers and offline progress (2) | 5 | 4 | 4 | 4 | 4 | 4 |
| Operational burden for one developer (3) | 5 | 4 | 4 | 5 | 2 | 2 |
| Cost predictability (2) | 5 | 2 | 4 | 4 | 3 | 5 |
| Portability / lock-in (1) | 2 | 2 | 3 | 2 | 2 | 5 |
| **Weighted total (70 max)** | **67** | 50 | 55 | 60 | 46 | 56 |

Convex is a credible runner-up. Its reactive queries suit live views, but the 1 s mutation cap means every large turn has to be chunked, and its storage model is less natural for one snapshot plus a log per game.

## 5. Recommended architecture

```
Browser (GitHub Pages, /SpellChaos/)
  │  HTTPS JSON + WebSocket (seat token in header)
  ▼
Cloudflare Worker  "api"
  ├─ routes /api/*; rate limits; maps join code → game id
  └─ forwards to ──► Durable Object "Game" (one per game, SQLite)
                       ├─ engine (same packages as the browser)
                       ├─ tables: meta, seats, snapshot, turns, commands, events, push_subs
                       ├─ alarm: deadline, reminder, chunked resolution
                       └─ fan-out: WebSocket push of "view changed" + Web Push / email
Durable Object "Directory" (join code → game id, short-lived)
```

Why this shape:
- **One object per game** serialises all commands to that game. "Last lock starts resolution" therefore cannot double-fire, and no distributed locking is needed.
- **Alarms** drive deadlines and resolution in time-boxed chunks. A crash mid-turn resumes from the last persisted atomic step with identical results; the engine already tests this property.
- **The engine is unchanged.** The server imports the same `engine`, `views` and `persistence` modules as the client.
- **Low cost.** The $5/month base covers expected hobby use. A 300 ms to 3 s resolution per turn, at 1,000 turns a month, is at most about 3M CPU-ms, against 30M included.

Lock-in mitigation: the game server is a small adapter (load snapshot → apply command → save → notify). Write it against a `GameStore` and `Scheduler` interface, so a Node + SQLite version can be added later if needed.

## 6. Risks and unknowns

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Existing hidden-information leaks (#15–#19) spoil the game for honest players | Medium | Prerequisite fixes; spoiler checks in tests (spec §11) |
| Very large battles exceed the per-invocation CPU limit | Medium | Chunked resolution by step count and time budget (spec §6.4); performance work in #33 |
| Engine or content changes break games in progress | Medium | Pin each game to its rules/content version; keep old engine builds bundled, or only ship breaking changes when no games are active (spec §9) |
| iOS push needs a Home Screen install | Medium | In-app prompt explaining the step; optional email fallback |
| Service worker conflicts with the "no service worker" design rule | Low | A push-only service worker with no caching (owner decision) |
| Join codes posted publicly let strangers join | Medium | Host approves each joiner in the lobby; code closes at start; host can regenerate it (spec §4) |
| Free-plan Durable Object CPU limit is not stated explicitly in Cloudflare's docs | Low | Plan on Workers Paid from the start |

## 7. Sources

Retrieved 7 November 2026.

- [cf-limits] Cloudflare Workers limits — https://developers.cloudflare.com/workers/platform/limits/
- [cf-pricing] Cloudflare Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/
- [cf-do] Durable Objects pricing — https://developers.cloudflare.com/durable-objects/platform/pricing/
- [cf-do-limits] Durable Objects limits — https://developers.cloudflare.com/durable-objects/platform/limits/ ; WebSockets — https://developers.cloudflare.com/durable-objects/best-practices/websockets/
- Durable Objects on Workers Free — https://developers.cloudflare.com/changelog/post/2025-04-07-durable-objects-free-tier/
- Worker size limit raised to 64 MiB — https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/
- [supa-fn] Supabase Edge Function limits — https://supabase.com/docs/guides/functions/limits
- [supa-rt] Supabase Realtime limits — https://supabase.com/docs/guides/realtime/limits ; pricing — https://supabase.com/pricing
- [fb-quota] Cloud Functions for Firebase quotas — https://firebase.google.com/docs/functions/quotas ; plans — https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- [convex] Convex limits — https://docs.convex.dev/production/state/limits
- [aws-free] AWS free serverless — https://aws.amazon.com/free/serverless/
- [fly] Fly.io pricing — https://fly.io/pricing.md
- [pushpad] iOS Web Push requirements — https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications
- [OneSignal] Web push for iOS — https://documentation.onesignal.com/docs/web-push-for-ios
- Resend free tier (third-party summary: 3,000 per month, 100 per day) — https://automationatlas.io/answers/resend-free-tier-explained-2026/
