# First build increment — foundation

Status: initial foundation implemented; Stage 1 not yet fully complete.

The owner approved the plan and authorized routine decisions using best judgment.
This branch records the first tested implementation increment for review.

## Delivered

- Strict TypeScript workspace and pinned toolchain/dependencies with lockfile.
- Portable state and command schemas; transactional snapshot decoding.
- Versioned xorshift32, explicit setup/resolution/AI streams and bounded sampling.
- Immutable LockTurn command, revision checks, duplicate acknowledgements and
  conflict rejection.
- Filtered player-view boundary, explicit injected-clock scheduling helpers.
- Canonical JSON serialization and fresh-state continuation tests.
- GitHub Actions typecheck, test and build workflow.
- Initial requirements inventory derived from the condensed specification.

## Verification

Local `pnpm check` and `pnpm build` pass. Eleven tests include 1,000 seeded
generated RNG cases. This is foundation coverage, not game-rule coverage.
GitHub run results are reported separately from local verification.

## Outstanding

- Full original-text source archive and source-complete requirements inventory.
- Stable digest API, browser engine-equivalence checks and minimal browser shell.
- Atomic resolution stepping, implemented alongside the later phase resolver.
- Frozen save fixtures and import-boundary enforcement.
- All gameplay, content and presentation stages.

## Recorded process decision

The source archive remains incomplete; the condensed transcription is explicitly
labelled and not passed off as the original. Technical foundation work proceeded
alongside that documentation gap under the owner's instruction to use judgment.
This does not mark Stage 0 complete or waive any game rule or release criterion.
The initial requirements JSON preserves source lines and marks entries planned;
it is not a claim of complete per-rule acceptance coverage.

## Determinism details

xorshift32-v1 uses nonzero uint32 state and bitwise shifts 13,17,5. Its output
domain excludes zero; bounded rejection sampling therefore uses 2^32−1, not
2^32, as the domain size. Each stream has independent serialized state. The
seed-1 vector is pinned in tests. Canonical JSON sorts object keys and preserves
array ordering. Neither animation nor the scheduling clock is engine state.
