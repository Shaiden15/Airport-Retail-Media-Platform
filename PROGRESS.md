# Progress Log

Checkpoint after every phase so work can resume after a context reset. Plan: `PLAN.md`.

## Decisions
- 2026-10-24: Claims: HMAC-signed offer links expiring at the linked flight's gate close; per-phone codes; family share; simulated shoppers make dashboards tick (labelled `simulated`). Learner counts exposures on every play, so learned lifts stay calibrated; Reset demo restores feeds, totals and learning.
- 2026-10-24: Playground = Dockerfile target `playground` (API serves the web app on 7860, about 145 MB RSS). Compose binds to 127.0.0.1; phone scanning uses `npm run dev` or the deployed URL.
- 2026-10-24: Scoring formula and rules documented in `docs/decision-pipeline.md`. Delay goodwill is a takeover rule (required trigger, delay >= 60) rather than an auction, so XH501 at 45 min shows perfume and an injected 75 min shows the voucher.
- 2026-10-24: Prices are per play at network scale (about 1M plays/day across 180 screens). `GENERATOR_VERSION` in `generator/index.ts` forces a re-seed on boot whenever generated data changes.
- 2026-10-24: Data world follows the official samples: fictional airport MQI, 11 sample airlines, fictional cities and `X*` nationality codes. Worked example relabelled XH501/XD881/YA233 at Gates 42-44 (`docs/assumptions.md`).
- 2026-10-24: `FLIGHT_SOURCE=mock-aidx | vendor-api` exactly as the spec words it (AODB CSV snapshot + AIDX stream); `ZONE_SOURCE=mock-acris | fiware-live`.
- 2026-10-24: Database is built-in `node:sqlite` + numbered SQL migrations (no native module to download). Scripts pass `--disable-warning=ExperimentalWarning`.
- 2026-10-24: Forum clarifications applied (PLAN.md section 14): scores illustrative, no hardcoding; playground is the only thing leadership will use.
- 2026-10-23: **Git: the user does all commits and pushes.** Claude prepares changes and reports "ready to commit" only.
- 2026-10-23: Product name **Dwellcast** (no airport-media conflicts found). Second language **Hindi** (default; change in `config/theme.json`). Hosting: free only (Hugging Face Spaces primary, Render free backup, UptimeRobot keep-alive).
- TypeScript 5.9.3, not 7.x: typescript-eslint does not support 7.x yet.
- API runs TypeScript directly via `tsx` (dev and prod); all packages are `noEmit`, type-checked by `tsc`.
- Versions pinned to match the local npm cache where possible (slow network, ~43 KB/s on 2026-10-23).

## Phase status
| Phase | Status | Notes |
|---|---|---|
| P0 Foundation | Done 2026-10-23 | verify green (14 tests), OpenGrep r/all 0 ERROR / 0 WARNING, web build OK, dev servers smoke-tested |
| P1 Data + adapters | Done 2026-10-24 | 52 tests green, OpenGrep 0 ERROR / 0 WARNING. Generator: 900 legs, 3,729 AIDX msgs, 1,440 ACRIS measurements, 180 screens, 40 outlets, 25 campaigns, 368 history days |
| P2 Engine | Done 2026-10-24 | 82 tests green. Worked example reproduces; injected delay re-plans gate screens in about 6 ms; 60x at about 27 ms per tick; hallucinated AI proposal rejected |
| P3 Vertical slice + deploy | Done 2026-10-24 (deploy pending accounts) | 91 unit/API + 5 E2E green, OpenGrep 0/0. Passenger screen, Why this ad, QR claim on phone, retailer live, control bar, split demo, Docker files, deploy guide. Image build waits for Docker Desktop; hosting waits for free accounts |
| P4 Role dashboards | Not started | |
| P5 WOW extras | Not started | |
| P6 Shoulds | Not started | |
| P7 Hardening + submission | Not started | |

## Environment notes
- Docker Desktop must be running for `docker compose` (still not running on 2026-10-24; compose file validated only).
- Windows: stopping a background npm task can orphan its node child, which keeps the port. `scripts/dev.mjs` now kills the whole tree; if a port is stuck, `taskkill /pid <pid> /T /F`.
- E2E: `npm run e2e` drives the installed Chrome (`channel: chrome`), no browser download.
- OpenGrep v1.32.0 runs inside WSL Ubuntu on Windows (`npm run sast`). The 1 scan error is a broken C# rule in the ruleset, not our code.
- Do not use `npm install --prefer-offline`: stale cached metadata breaks resolution.
- OpenGrep traps hit in P1 and fixed: `html-in-template-string` (build XML with XMLBuilder, never template strings), `no-replaceall` (use regex `/g`), TS `const` type parameters break its parser.
- Generated feeds are committed (`data/feeds/`, about 7 MB); regenerate with `npm run generate --workspace apps/api`.
- `Airport-Retail-Media-Platform/` is the user's separate clone of the GitHub repo; excluded locally via .git/info/exclude.
