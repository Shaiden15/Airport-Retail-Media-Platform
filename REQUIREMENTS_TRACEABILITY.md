# Requirements Traceability

Every requirement from the challenge specification, mapped to the code that implements it, the test that proves it, and how a reviewer can see it in the running app.

Status: `Planned` | `In progress` | `Done`. Paths are relative to the repository root.

## Platform and architecture

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| ARC-1 | Must | Separate frontend and backend | Done | `apps/web` (React SPA), `apps/api` (Fastify), `packages/shared`; separate `web` (nginx) and `api` containers in `docker-compose.yml` | `apps/api/src/app.test.ts`, `e2e/demo.spec.ts` | `npm run dev`: web :5173, api :4000 |
| ARC-2 | Must | REST API plus SSE live updates | Done | `apps/api/src/routes/engineRoutes.ts` (REST), `apps/api/src/live/SseHub.ts` (`GET /api/stream?topics=`) | `apps/api/src/routes/api.test.ts` (incl. live SSE) | `curl -N localhost:4000/api/stream` |
| ARC-3 | Must | Adapter layer isolated from business logic | Done | `apps/api/src/adapters/` (`types.ts` contracts, `registry.ts` the only switch), canonical model `packages/shared/src/canonical/` | `apps/api/src/adapters/sources.test.ts` | `docs/adapter-guide.md` |
| ARC-4 | Must | Embedded database with migrations and seed script | Done | `apps/api/src/db/database.ts` (node:sqlite, migration runner), `apps/api/src/db/migrations/*.sql`, `apps/api/src/db/seed.ts`, `apps/api/src/cli/seed.ts` | `apps/api/src/db/database.test.ts` | `npm run seed --workspace apps/api` |
| ARC-5 | Must | One-command start (`docker compose up`) | In progress | `Dockerfile` (targets `api`, `web`, `playground`), `docker-compose.yml`, `deploy/nginx.conf`; compose file validated, image build to be run once Docker Desktop is available | `docker compose config` | `docker compose up`, then http://localhost:8080 |
| ARC-6 | Must | Deployed playground URL | In progress | Single image (`Dockerfile` target `playground`, API serves web on 7860), `render.yaml`, Hugging Face front matter in `README.md`, `docs/deploy.md`; tested locally in that mode (145 MB RSS) | Local run with `SERVE_WEB=true` | Needs the user's free Hugging Face / Render accounts |
| ARC-7 | Must | Widely used open-source stack, justified in README | In progress | `package.json`, `PLAN.md` section 2 | | README "Why this stack" |
| ARC-8 | Must | OpenAPI spec | Planned | | | |
| ARC-9 | Must | README, architecture diagram, adapter guide | Planned | | | |

## Data model and adapters

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| DAT-1 | Must | AODB flight movements mock, 33 columns as the sample file -> Flight, GateAssignment, AircraftType | Done | `apps/api/src/formats/aodbCsv.ts` (`AODB_COLUMNS`), `apps/api/src/adapters/aodb/aodbAdapter.ts`, `data/feeds/aodb/` | `apps/api/src/adapters/samples.test.ts` (official 320-row sample), `generator.test.ts` | `data/feeds/aodb/MQI_aodb_flights_2026-11-06_SYNTHETIC.csv` |
| DAT-2 | Must | IATA AIDX XML message stream (IATA_AIDX_FlightLegNotifRQ) -> FlightEvent | Done | `apps/api/src/formats/aidxXml.ts`, `apps/api/src/adapters/aidx/aidxAdapter.ts`, `apps/api/src/generator/aidxPlan.ts`, `data/feeds/aidx/` | `samples.test.ts` (official XH960 message, XXE), `sources.test.ts` | `data/feeds/aidx/examples/XH501_*.xml` |
| DAT-3 | Must | ACRIS NGSI-LD JSON -> Terminal, Zone, Checkpoint, QueueMeasurement | Done | `apps/api/src/formats/acrisNgsi.ts`, `apps/api/src/adapters/acris/acrisAdapter.ts`, `data/feeds/acris/`, reference `data/reference/acris/` | `samples.test.ts` (FIWARE examples), `sources.test.ts` | `data/feeds/acris/MQI_acris_entities.jsonld` |
| DAT-4 | Must | Platform tables: Screen, Advertiser, Outlet, Campaign, Creative, PromoCode, Impression, Redemption | Done | `apps/api/src/db/migrations/001_master_data.sql`, `002_campaigns.sql`, `003_activity.sql`; schemas `packages/shared/src/canonical/platform.ts` | `apps/api/src/db/database.test.ts` | `data/runtime/dwellcast.db` after seeding |
| DAT-5 | Must | Adapter contract `FlightSource.stream(): AsyncIterable<FlightEvent>` with mock and stub Live implementations | Done | `apps/api/src/adapters/types.ts` (`FlightSource`, `ZoneSource`), `flight/MockAidxFlightSource.ts`, `flight/VendorApiFlightSource.ts`, `acris/MockAcrisZoneSource.ts`, `acris/FiwareLiveZoneSource.ts` | `sources.test.ts` (end to end + live stubs) | `docs/adapter-guide.md` |
| DAT-6 | Must | Source switch by one config value (`FLIGHT_SOURCE=mock-aidx \| vendor-api`) | Done | `apps/api/src/config.ts`, `apps/api/src/adapters/registry.ts`, `.env.example` | `sources.test.ts`, `app.test.ts` | `GET /api/health` shows adapters in use |
| DAT-7 | Must | ZonePresence per zone per 5-minute window (pax, nationalities, destinations, dom/intl, dwell) | Done | `apps/api/src/presence/PresenceEngine.ts` (`ZonePresence`), `presence/curves.ts` | `apps/api/src/runtime/runtime.test.ts` (delay raises zone pax), `apps/api/src/routes/api.test.ts` | `GET /api/presence`, `GET /api/presence/:zoneId` |
| DAT-8 | Must | Generator: ~900 flights, ~180 screens, 40 outlets, 10 airlines, 25 campaigns, 30 days history, fictional names | Done | `apps/api/src/generator/` (`schedule.ts`, `platform.ts`, `reference.ts`, `layout.ts`), `apps/api/src/cli/generate.ts`; 11 airlines from the official sample, see `docs/assumptions.md` | `generator.test.ts`, `npm run sweep` (brand blocklist) | `npm run generate --workspace apps/api` |
| DAT-9 | Must | Plausible per-flight crowd profiles (trip purpose, party, age, gender, cabin, nationality, time context, crowd size) | Done | `apps/api/src/profiles/crowdProfile.ts`, `packages/shared/src/canonical/profile.ts` | `apps/api/src/profiles/crowdProfile.test.ts` (Monday 07:00 business, Friday evening families) | Profiles shown in Phase 2 dashboards |

## Audience matching and decision pipeline

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| DEC-1 | Must | Profile: crowd profile per screen catchment, weighted by gate proximity and time to boarding | Done | `PresenceEngine.screen()` (distance weight `exp(-d/120)` x presence curve) | `apps/api/src/runtime/runtime.test.ts` | `GET /api/screens/:id/decision` (`crowd`) |
| DEC-2 | Must | Filter: hard rules (schedule, placement, approval, brand safety, dom/intl, destination, min crowd, budget) | Done | `apps/api/src/decision/eligibility.ts` (`hardFilter`, reason per campaign) | `apps/api/src/runtime/runtime.test.ts` (lounge filtered by placement) | Candidates list shows each filter reason |
| DEC-3 | Must | Score: optimized algorithm and/or LLM agent | Done | `apps/api/src/decision/scorer.ts` (documented formula), `decision/agent.ts` (pluggable agent) | `apps/api/src/decision/decision.test.ts` | `docs/decision-pipeline.md` |
| DEC-4 | Must | Business rules: airline priority, competitor separation, frequency cap, budget pacing | Done | `apps/api/src/decision/DecisionEngine.ts` (pin, delay goodwill, airline priority, separation, caps, exploration), `decision/ledger.ts` | `apps/api/src/runtime/runtime.test.ts` | `docs/decision-pipeline.md` section 5 |
| DEC-5 | Must | Choose and log full decision (profile, candidates, scores, winning reason) | Done | `Decision` record in `DecisionEngine.ts`, in-memory log + `decisions` table (`004_engine.sql`) | `apps/api/src/runtime/runtime.test.ts`, `apps/api/src/routes/api.test.ts` (search) | `GET /api/decisions?q=` |
| DEC-6 | Must | Learn: scans and redemptions per segment update conversion estimates | Done | `apps/api/src/decision/learner.ts` (Beta-Bernoulli per campaign x segment, primed from history), `DecisionEngine.recordRedemption` | `decision.test.ts` | Learned lift shown in each candidate breakdown |
| DEC-7 | Must | Evidence-first: inputs carry source, timestamp, freshness; AI choice executed only after deterministic checks; fallback to rule-based default | Done | `presence/evidence.ts`, `decision/validator.ts` (exists, trusted, fresh, hard rules, reproducible score) | `decision.test.ts`, `apps/api/src/runtime/runtime.test.ts` (hallucination rejected) | `POST /api/sim/inject` type `hallucination` |
| DEC-8 | Must | Worked example (Gate 42, 14:10) reproducible in the demo | Done | `generator/schedule.ts` (`WORKED_EXAMPLE_FLIGHTS`), `POST /api/sim/scenario/worked-example` | `apps/api/src/runtime/runtime.test.ts`, `apps/api/src/routes/api.test.ts` | `docs/assumptions.md`, `docs/decision-pipeline.md` |
| DEC-9 | Must | Campaign targeting: segment weights, hard filters, placement, budget and limits, triggers | In progress | Model and engine done: `packages/shared/src/canonical/platform.ts` (`targetingSchema`, trigger `mode`); builder UI in Phase 4 | `runtime.test.ts` | Phase 4 campaign builder |
| DEC-10 | Must | Aggregated shares only, no per-passenger data | Done | `packages/shared/src/canonical/profile.ts`, `PresenceEngine` (shares only), `docs/assumptions.md` | `crowdProfile.test.ts` | No passenger-level table exists in any migration |

## Platform Admin

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| ADM-1 | Must | Live network map (T1/T2 SVG), screens coloured online/degraded/offline, presence heat overlay | Planned | | | |
| ADM-2 | Must | KPI strip: screens online %, plays today, impressions, revenue (configurable currency), active campaigns, avg latency | Planned | | | |
| ADM-3 | Must | Incident and bug tracker, auto-raised alerts, severity, owner, status | Planned | | | |
| ADM-4 | Must | Master data CRUD: vendors, outlets and F&B retailers, airlines, locations, screens | Planned | | | |
| ADM-5 | Must | Rule engine settings, searchable decision log, segment model version | In progress | API done: `GET/PUT /api/engine/settings` (persisted), `GET /api/decisions`, `modelVersion` on every decision; UI in Phase 4 | `apps/api/src/routes/api.test.ts` | Phase 4 admin page |
| ADM-6 | Should | Data feed health: AODB/AIDX/ACRIS status, msgs/min, last message, adapter in use | In progress | API done: `GET /api/feeds` (`FeedPump.health`, `ratePerMinute`); UI in Phase 4 | `api.test.ts` | Phase 4 admin page |
| ADM-7 | Should | Performance panel: API p95, playlist build time, 7-day uptime | Planned | | | |

## Retailer

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| RET-1 | Must | Live dashboard: impressions, scans, redemptions, conversion, revenue attributed | Done | `apps/web/src/roles/retailer/RetailerPage.tsx` (`RetailerLiveDashboard`), `GET /api/retailer/:id/live`, simulated shoppers in `ClaimService` | `apps/api/src/claims/claims.test.ts`, `e2e/demo.spec.ts` | `/retailer`, company switcher |
| RET-2 | Must | Passenger flow near my store, next 2 hours, top destinations and nationalities | Planned | | | |
| RET-3 | Must | Campaign builder with mock screen preview | Planned | | | |
| RET-4 | Must | Creative library, upload or reuse, duplicate past campaign in one click | Planned | | | |
| RET-5 | Must | Promo codes: time-boxed, QR, expire with linked flight boarding, share-to-family second code | In progress | Codes, QR, flight-linked expiry and family share done (`ClaimService`, `ClaimPage`); retailer code management UI in Phase 4 | `apps/api/src/claims/claims.test.ts` | Claim page share button |
| RET-6 | Must | Campaign history with spend, impressions, redemptions, ROI, run again | Planned | | | |
| RET-7 | Must | Live audience-match preview, performance by segment, suggested weight changes | Planned | | | |
| RET-8 | Should | Trigger rules (delay > N min at gates) | Planned | | | |
| RET-9 | Should | Stock-aware offers (mock toggle) | Planned | | | |
| RET-10 | Should | Budget pacing and A/B creative comparison | Planned | | | |

## Media Manager

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| MED-1 | Must | Inventory calendar: screen x hour, booked / available / premium | Planned | | | |
| MED-2 | Must | Yield and pricing: suggested price per slot, occupancy %, 7-day revenue forecast | Planned | | | |
| MED-3 | Must | Approval queue with approve/reject and brand-safety checklist | Planned | | | |
| MED-4 | Must | Advertiser overview: top by spend, running campaigns, under-delivery flagged | Planned | | | |
| MED-5 | Must | Segment heatmap, conflict view, manual pin/override with reason | In progress | Engine supports pin with reason and expiry (`DecisionEngine.pin`) and per-candidate conflict data; UI in Phase 4 | - | Phase 4 media page |
| MED-6 | Should | Package builder | Planned | | | |
| MED-7 | Should | One-click advertiser report (PDF or shareable link) | Planned | | | |

## Airline Representative

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| AIR-1 | Must | My flights today: list and timeline with gate, status, delay, load factor | Planned | | | |
| AIR-2 | Must | Gate-area messaging scheduled for my boarding window | Planned | | | |
| AIR-3 | Must | Delay goodwill automation, voucher co-funded with an F&B retailer | In progress | Engine done: required delay trigger takes over gate screens (`delay-goodwill` rule); airline configuration UI in Phase 4 | `apps/api/src/runtime/runtime.test.ts` | Inject a 75-minute delay on XH501 |
| AIR-4 | Must | Crowd profile of own flights, partner offers ranked by fit, what played at my gates and why | Planned | | | |
| AIR-5 | Should | Co-marketing marketplace, accept in one click | Planned | | | |
| AIR-6 | Should | Performance among own passengers | Planned | | | |

## Passenger screen simulator

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| PAX-1 | Must | Full-screen view of a chosen screen, 9:16 or 16:9 frame | Done | `apps/web/src/roles/passenger/ScreenPlayer.tsx` (frame follows screen orientation), `ScreenPicker.tsx`, kiosk route `/screen/:id` (`KioskScreen.tsx`) | `e2e/demo.spec.ts` (kiosk) | `/passenger?screen=SCR-052`, `/screen/SCR-052` |
| PAX-2 | Must | FIDS-style context strip with nearby flights | Done | `ScreenPlayer.tsx` departures strip (`/api/screens/:id` nearby flights, delays shown) | `e2e/demo.spec.ts` | Departures panel on every screen |
| PAX-3 | Must | Dynamic ad selection that changes with simulation time | Done | Engine every 15 s per screen plus event re-plans; `ScreenPlayer` refreshes on SSE decision events | `e2e/demo.spec.ts`, `runtime.test.ts` | Press Play at 60x on `/demo` |
| PAX-4 | Must | Promo QR with live countdown, real phone opens claim page on LAN address, redemption visible in retailer dashboard | Done | `apps/web/src/components/QrCode.tsx`, signed offers `apps/api/src/claims/`, `apps/api/src/network.ts` (LAN IP or `PUBLIC_BASE_URL`), mobile `apps/web/src/claim/ClaimPage.tsx` | `apps/api/src/claims/claims.test.ts`, `e2e/demo.spec.ts` (claim reaches retailer under 2 s) | Scan the QR on `/demo` with a phone on the same Wi-Fi |
| PAX-5 | Must | "Why this ad?" overlay: crowd profile, top 3 candidates, winning rule | Done | `apps/web/src/roles/passenger/WhyThisAd.tsx` (crowd bars, top 3 with scores, filtered reasons, winning rule, deterministic checks, evidence) | `e2e/demo.spec.ts` | Why this ad? button on any screen |

## WOW features

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| WOW-1 | Must | Simulation control bar for all roles: play, pause, 1x/10x/60x, jump to time, inject events | Done | `apps/web/src/app/SimControlBar.tsx` (in every role's shell), `apps/api/src/sim/`, `POST /api/sim/control`, `POST /api/sim/inject`, `POST /api/sim/reset` | `e2e/demo.spec.ts`, `api.test.ts` | Bar under the header on every page |
| WOW-2 | Must | Live cause and effect within 2 s of an injected AIDX delay | Done | `Runtime.injectDelay` (real AIDX XML through the adapter), SSE `decision`/`flight` events, `ScreenPlayer` live refresh | `e2e/demo.spec.ts` (browser-measured under 2 s), `runtime.test.ts` | Inject event > Delay a flight: XH501, 75 minutes |
| WOW-3 | Must | Split-screen demo mode | Done | `apps/web/src/roles/demo/SplitDemo.tsx` (`/demo`): passenger screen left, role panel right | `e2e/demo.spec.ts` | Header link Split-screen demo |
| WOW-4 | Must | GenAI creative assistant, mocked offline, pluggable provider, English plus second language | Planned | | | |
| WOW-5 | Must | Smart recommendation: best 3 slots tomorrow with predicted impressions | Planned | | | |

## UI and non-functional

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| UI-1 | Must | Role switcher in header; sample company switcher for retailer and airline | Done | `apps/web/src/app/Shell.tsx` (role switcher, company switcher fed by `/api/config/public`, `/api/advertisers`, `/api/airlines`) | `packages/shared/src/theme.test.ts` | Header Role and Company selectors |
| UI-2 | Must | Dark control-room theme for Admin, light theme for business roles | In progress | `packages/shared/src/roles.ts` (`roleTheme`), `apps/web/src/theme/applyTheme.ts` | `packages/shared/src/theme.test.ts` | Switch role Admin vs Retailer |
| UI-3 | Must | White-label theme config (name, logo, colours), no real marks | In progress | `config/theme.json`, `packages/shared/src/theme.ts`, `scripts/brand-blocklist.json` | `packages/shared/src/theme.test.ts`, `npm run sweep` | Edit `config/theme.json` |
| UI-4 | Must | English plus one configurable second language for UI and ad content | In progress | `apps/web/src/i18n/`, `config/theme.json` (`locales`) | `apps/web/src/i18n/locales.test.ts` | Header "Language" selector |
| UI-5 | Must | Responsive at 1440px and 1920px; mobile layout for claim page | In progress | Claim page is mobile-first (`ClaimPage.tsx`); dashboards checked at 1440px; 1920px pass in Phase 7 | `e2e/demo.spec.ts` (390px phone context) | Resize the browser |
| NFR-1 | Must | Dashboard updates within 2 s of a feed event | Done | Immediate re-plan + SSE push (`Runtime`, `SseHub`), live UI refresh | `e2e/demo.spec.ts` (screen switch and retailer update each measured under 2 s) | Inject a delay; claim a code |
| NFR-2 | Must | 60x simulation without UI lag | Done | About 27 ms per 250 ms engine tick; throttled SSE payloads built only when due | `runtime.test.ts`, `e2e/demo.spec.ts` (60x run, no console errors) | Speed 60x, Play |
| NFR-3 | Must | Runs offline on a clean laptop, no paid or cloud services | Done | Embedded SQLite (`node:sqlite`), generated feeds, mock AI, no external calls | Full suite runs offline | `npm run dev` with the network off |
| NFR-4 | Must | Pluggable AI provider, default mock works with no API key | In progress | `apps/api/src/config.ts` (`AI_PROVIDER`) | `apps/api/src/app.test.ts` | `GET /api/health` |
