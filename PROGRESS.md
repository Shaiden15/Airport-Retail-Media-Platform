# Progress Log

Checkpoint after every phase so work can resume after a context reset. Plan: `PLAN.md`.

## Decisions
- 2026-10-23: Product name **Dwellcast** (no airport-media conflicts found). Second language **Hindi** (default; change in `config/theme.json`). Hosting decided in P3.
- TypeScript 5.9.3, not 7.x: typescript-eslint does not support 7.x yet.
- API runs TypeScript directly via `tsx` (dev and prod); all packages are `noEmit`, type-checked by `tsc`.
- Versions pinned to match the local npm cache where possible (slow network, ~43 KB/s on 2026-10-23).

## Phase status
| Phase | Status | Notes |
|---|---|---|
| P0 Foundation | Done 2026-10-23 | verify green (14 tests), OpenGrep r/all 0 ERROR / 0 WARNING, web build OK, dev servers smoke-tested |
| P1 Data + adapters | Blocked on input | Needs `aodb-samples/` from the challenge page in `data/aodb-samples/` |
| P2 Engine | Not started | |
| P3 Vertical slice + deploy | Not started | |
| P4 Role dashboards | Not started | |
| P5 WOW extras | Not started | |
| P6 Shoulds | Not started | |
| P7 Hardening + submission | Not started | |

## Environment notes
- Docker Desktop must be running for `docker compose` (not running on 2026-10-23).
- OpenGrep v1.32.0 runs inside WSL Ubuntu on Windows (`npm run sast`). The 1 scan error is a broken C# rule in the ruleset, not our code.
- Do not use `npm install --prefer-offline`: stale cached metadata breaks resolution.
- `Airport-Retail-Media-Platform/` is the user's separate clone of the GitHub repo; excluded locally via .git/info/exclude.
