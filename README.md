# Dwellcast

Airport retail media platform: ads and promotions on airport screens, timed to the passengers actually in front of each screen using live flight and passenger-flow data.

> Work in progress. Full setup, architecture, adapter guide and API docs land as the build progresses. See `PLAN.md` and `REQUIREMENTS_TRACEABILITY.md`.

## Quick start (development)

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000/api/health

## Mock data

```bash
npm run generate --workspace apps/api
npm run seed --workspace apps/api
```

`generate` writes one airport day in real source formats to `data/feeds/` (AODB CSV, AIDX XML stream, ACRIS NGSI-LD). `seed` applies the SQL migrations and loads master data, campaigns and 30 days of history into SQLite. See `data/feeds/README.md`, `docs/adapter-guide.md` and `docs/assumptions.md`.

## Quality gates

| Command | What it checks |
|---|---|
| `npm run verify` | Type check, lint, hygiene sweep, unit and API tests |
| `npm run sast` | OpenGrep static analysis with the `r/all` ruleset (0 ERROR, max 3 WARNING) |
| `npm run package` | Builds the submission zip from the committed tree |

## Configuration

Copy `.env.example` to `.env`. Every value has a default, so the app runs with no `.env`. White-label branding, currency and languages live in `config/theme.json`.
