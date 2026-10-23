# Requirements Traceability

Every requirement from the challenge specification, mapped to the code that implements it, the test that proves it, and how a reviewer can see it in the running app.

Status: `Planned` | `In progress` | `Done`. Paths are relative to the repository root.

## Platform and architecture

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| ARC-1 | Must | Separate frontend and backend | In progress | `apps/web`, `apps/api`, `packages/shared` | `apps/api/src/app.test.ts` | `npm run dev`, web on :5173, api on :4000 |
| ARC-2 | Must | REST API plus SSE live updates | Planned | | | |
| ARC-3 | Must | Adapter layer isolated from business logic | Planned | | | |
| ARC-4 | Must | Embedded database with migrations and seed script | Planned | | | |
| ARC-5 | Must | One-command start (`docker compose up`) | Planned | | | |
| ARC-6 | Must | Deployed playground URL | Planned | | | |
| ARC-7 | Must | Widely used open-source stack, justified in README | In progress | `package.json`, `PLAN.md` section 2 | | README "Why this stack" |
| ARC-8 | Must | OpenAPI spec | Planned | | | |
| ARC-9 | Must | README, architecture diagram, adapter guide | Planned | | | |

## Data model and adapters

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| DAT-1 | Must | AODB flight movements mock, 33 columns as the sample file -> Flight, GateAssignment, AircraftType | Planned | | | |
| DAT-2 | Must | IATA AIDX XML message stream (IATA_AIDX_FlightLegNotifRQ) -> FlightEvent | Planned | | | |
| DAT-3 | Must | ACRIS NGSI-LD JSON -> Terminal, Zone, Checkpoint, QueueMeasurement | Planned | | | |
| DAT-4 | Must | Platform tables: Screen, Advertiser, Outlet, Campaign, Creative, PromoCode, Impression, Redemption | Planned | | | |
| DAT-5 | Must | Adapter contract `FlightSource.stream(): AsyncIterable<FlightEvent>` with mock and stub Live implementations | Planned | | | |
| DAT-6 | Must | Source switch by one config value (`FLIGHT_SOURCE=mock-aidx \| vendor-api`) | In progress | `apps/api/src/config.ts` | `apps/api/src/app.test.ts` | `GET /api/health` shows adapters in use |
| DAT-7 | Must | ZonePresence per zone per 5-minute window (pax, nationalities, destinations, dom/intl, dwell) | Planned | | | |
| DAT-8 | Must | Generator: ~900 flights, ~180 screens, 40 outlets, 10 airlines, 25 campaigns, 30 days history, fictional names | Planned | | | |
| DAT-9 | Must | Plausible per-flight crowd profiles (trip purpose, party, age, gender, cabin, nationality, time context, crowd size) | Planned | | | |

## Audience matching and decision pipeline

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| DEC-1 | Must | Profile: crowd profile per screen catchment, weighted by gate proximity and time to boarding | Planned | | | |
| DEC-2 | Must | Filter: hard rules (schedule, placement, approval, brand safety, dom/intl, destination, min crowd, budget) | Planned | | | |
| DEC-3 | Must | Score: optimized algorithm and/or LLM agent | Planned | | | |
| DEC-4 | Must | Business rules: airline priority, competitor separation, frequency cap, budget pacing | Planned | | | |
| DEC-5 | Must | Choose and log full decision (profile, candidates, scores, winning reason) | Planned | | | |
| DEC-6 | Must | Learn: scans and redemptions per segment update conversion estimates | Planned | | | |
| DEC-7 | Must | Evidence-first: inputs carry source, timestamp, freshness; AI choice executed only after deterministic checks; fallback to rule-based default | Planned | | | |
| DEC-8 | Must | Worked example (Gate 42, 14:10) reproducible in the demo | Planned | | | |
| DEC-9 | Must | Campaign targeting: segment weights, hard filters, placement, budget and limits, triggers | Planned | | | |
| DEC-10 | Must | Aggregated shares only, no per-passenger data | Planned | | | |

## Platform Admin

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| ADM-1 | Must | Live network map (T1/T2 SVG), screens coloured online/degraded/offline, presence heat overlay | Planned | | | |
| ADM-2 | Must | KPI strip: screens online %, plays today, impressions, revenue (configurable currency), active campaigns, avg latency | Planned | | | |
| ADM-3 | Must | Incident and bug tracker, auto-raised alerts, severity, owner, status | Planned | | | |
| ADM-4 | Must | Master data CRUD: vendors, outlets and F&B retailers, airlines, locations, screens | Planned | | | |
| ADM-5 | Must | Rule engine settings, searchable decision log, segment model version | Planned | | | |
| ADM-6 | Should | Data feed health: AODB/AIDX/ACRIS status, msgs/min, last message, adapter in use | Planned | | | |
| ADM-7 | Should | Performance panel: API p95, playlist build time, 7-day uptime | Planned | | | |

## Retailer

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| RET-1 | Must | Live dashboard: impressions, scans, redemptions, conversion, revenue attributed | Planned | | | |
| RET-2 | Must | Passenger flow near my store, next 2 hours, top destinations and nationalities | Planned | | | |
| RET-3 | Must | Campaign builder with mock screen preview | Planned | | | |
| RET-4 | Must | Creative library, upload or reuse, duplicate past campaign in one click | Planned | | | |
| RET-5 | Must | Promo codes: time-boxed, QR, expire with linked flight boarding, share-to-family second code | Planned | | | |
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
| MED-5 | Must | Segment heatmap, conflict view, manual pin/override with reason | Planned | | | |
| MED-6 | Should | Package builder | Planned | | | |
| MED-7 | Should | One-click advertiser report (PDF or shareable link) | Planned | | | |

## Airline Representative

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| AIR-1 | Must | My flights today: list and timeline with gate, status, delay, load factor | Planned | | | |
| AIR-2 | Must | Gate-area messaging scheduled for my boarding window | Planned | | | |
| AIR-3 | Must | Delay goodwill automation, voucher co-funded with an F&B retailer | Planned | | | |
| AIR-4 | Must | Crowd profile of own flights, partner offers ranked by fit, what played at my gates and why | Planned | | | |
| AIR-5 | Should | Co-marketing marketplace, accept in one click | Planned | | | |
| AIR-6 | Should | Performance among own passengers | Planned | | | |

## Passenger screen simulator

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| PAX-1 | Must | Full-screen view of a chosen screen, 9:16 or 16:9 frame | Planned | | | |
| PAX-2 | Must | FIDS-style context strip with nearby flights | Planned | | | |
| PAX-3 | Must | Dynamic ad selection that changes with simulation time | Planned | | | |
| PAX-4 | Must | Promo QR with live countdown, real phone opens claim page on LAN address, redemption visible in retailer dashboard | Planned | | | |
| PAX-5 | Must | "Why this ad?" overlay: crowd profile, top 3 candidates, winning rule | Planned | | | |

## WOW features

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| WOW-1 | Must | Simulation control bar for all roles: play, pause, 1x/10x/60x, jump to time, inject events | Planned | | | |
| WOW-2 | Must | Live cause and effect within 2 s of an injected AIDX delay | Planned | | | |
| WOW-3 | Must | Split-screen demo mode | Planned | | | |
| WOW-4 | Must | GenAI creative assistant, mocked offline, pluggable provider, English plus second language | Planned | | | |
| WOW-5 | Must | Smart recommendation: best 3 slots tomorrow with predicted impressions | Planned | | | |

## UI and non-functional

| ID | Priority | Requirement | Status | Implementation | Tests | How to verify |
|---|---|---|---|---|---|---|
| UI-1 | Must | Role switcher in header; sample company switcher for retailer and airline | In progress | `apps/web/src/App.tsx`, `packages/shared/src/roles.ts` | `packages/shared/src/theme.test.ts` | Header "Role" selector |
| UI-2 | Must | Dark control-room theme for Admin, light theme for business roles | In progress | `packages/shared/src/roles.ts` (`roleTheme`), `apps/web/src/theme/applyTheme.ts` | `packages/shared/src/theme.test.ts` | Switch role Admin vs Retailer |
| UI-3 | Must | White-label theme config (name, logo, colours), no real marks | In progress | `config/theme.json`, `packages/shared/src/theme.ts`, `scripts/brand-blocklist.json` | `packages/shared/src/theme.test.ts`, `npm run sweep` | Edit `config/theme.json` |
| UI-4 | Must | English plus one configurable second language for UI and ad content | In progress | `apps/web/src/i18n/`, `config/theme.json` (`locales`) | `apps/web/src/i18n/locales.test.ts` | Header "Language" selector |
| UI-5 | Must | Responsive at 1440px and 1920px; mobile layout for claim page | Planned | | | |
| NFR-1 | Must | Dashboard updates within 2 s of a feed event | Planned | | | |
| NFR-2 | Must | 60x simulation without UI lag | Planned | | | |
| NFR-3 | Must | Runs offline on a clean laptop, no paid or cloud services | Planned | | | |
| NFR-4 | Must | Pluggable AI provider, default mock works with no API key | In progress | `apps/api/src/config.ts` (`AI_PROVIDER`) | `apps/api/src/app.test.ts` | `GET /api/health` |
