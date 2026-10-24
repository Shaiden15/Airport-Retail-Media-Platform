---
title: Dwellcast
emoji: ✈️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Dwellcast

Airport retail media platform: ads and promotions on airport screens, timed to the passengers actually in front of each screen using live flight (AODB, IATA AIDX) and passenger-flow (ACI ACRIS) data. Every ad decision is explainable and evidence-checked.

> Work in progress: the passenger screen, phone claim flow, simulation control bar and retailer live dashboard are working; the remaining role dashboards are being built. See `PLAN.md`, `PROGRESS.md` and `REQUIREMENTS_TRACEABILITY.md`.

## Run it

Requires Node.js 22.12 or newer.

```bash
npm install
npm run dev
```

- Web: http://localhost:5173 (open **Split-screen demo**, then **Worked example (Gate 42, 14:10)**)
- API: http://localhost:4000/api/health

Or with Docker, frontend and backend as separate containers:

```bash
docker compose up
```

Then open http://localhost:8080. Deploying the free playground (Hugging Face Spaces, Render): `docs/deploy.md`.

## The 60-second demo

1. **Worked example**: the Gate 42 screen shows the duty-free perfume offer; **Why this ad?** shows the crowd, the top candidates and the checks that allowed it.
2. **Inject event > Delay a flight**: delay XH501 to 75 minutes. The gate screens re-plan in milliseconds and the delay-goodwill voucher takes over.
3. **Scan the QR** with a phone on the same Wi-Fi: claim a code, share a family code. The redemption appears on the retailer panel immediately.

## Mock data

```bash
npm run generate --workspace apps/api
npm run seed --workspace apps/api
```

`generate` writes one airport day in real source formats to `data/feeds/` (AODB CSV, AIDX XML stream, ACRIS NGSI-LD). `seed` applies the SQL migrations and loads master data, campaigns and 30 days of history. The server does both automatically on first boot. See `data/feeds/README.md`, `docs/adapter-guide.md`, `docs/decision-pipeline.md` and `docs/assumptions.md`.

## Quality gates

| Command | What it checks |
|---|---|
| `npm run verify` | Type check, lint, hygiene sweep, unit and API tests |
| `npm run e2e` | Playwright end-to-end tests in Chrome (worked example, 2-second cause and effect, phone claim, 60x) |
| `npm run sast` | OpenGrep static analysis with the `r/all` ruleset (0 ERROR, max 3 WARNING) |
| `npm run package` | Builds the submission zip from the committed tree |

## Configuration

Copy `.env.example` to `.env`. Every value has a default, so the app runs with no `.env`. White-label branding, currency and languages live in `config/theme.json`; the airport, operating date and generator seed in `config/airport.json`.
