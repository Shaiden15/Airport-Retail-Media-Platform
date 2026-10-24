# Airport Retail Media Platform - Master Plan

Status: PLANNING ONLY. No code written yet.
Working name: "Dwellcast" (white-label, set in theme config). Fictional airport: use the name/code from the challenge's `aodb-samples/`.

---

## 0. Lessons from the last Topcoder challenge (AI Literacy platform, Aug 2026)

How it was scored: **Claude Haiku requirements review 80% (min 75) + AI Vulnerabilities 10% (min 80) + SAST/OpenGrep 10% (min 80)**. This challenge also adds a **human Community Review Board + user sign-off on a live playground URL**, so UI polish and demo flow count much more this time.

| # | What went wrong | Rule for this challenge |
|---|---|---|
| 1 | SAST scored **28/100** (3 ERROR, 56 WARNING; 10+ warnings = 0 points) and we only found out after submitting | Run OpenGrep locally (`--config=r/all`) from day 1 as a gate. Target **0 ERROR, 0-3 WARNING**. Write code that avoids the flagged patterns from the start (list in section 9) |
| 2 | Reviewer said "submission directory appears empty" twice, giving 0% on whole requirements. Cause: zip had files nested in a `Challenge/` subfolder, and the reviewer sometimes missed things | Zip from `git archive` so files sit at the root. Add `REQUIREMENTS_TRACEABILITY.md` mapping every Must/Should to exact files, symbols, routes and test names. Use the spec's own words in code names (`ZonePresence`, `FlightSource`, `CrowdProfile`, `FLIGHT_SOURCE`) so its search finds them |
| 3 | "PARTIAL": `userLevel` existed in the data model but nothing in the UI ever set it | Every requirement wired end to end: data -> API -> UI control -> visible effect -> test. No stubs that look real but do nothing (except the declared `Live` adapter stubs) |
| 4 | "PARTIAL": publish/enable only on missions, not on child entities | Read each requirement literally and apply it to **every** entity it names (e.g. master data CRUD for all six entity types, not just screens) |
| 5 | Scores swung 80 -> 92 -> 80 between near-identical uploads (the AI reviewer is non-deterministic) | Submit early, read the report zip (`output/requirements/*.md`), fix, resubmit. Traceability doc reduces variance |
| 6 | "Not a git repository, can't verify seed content is committed" | Repo is a git repo from the first commit; seed and generated sample data are committed |
| 7 | Real AI provider tested late (Groq 400, deprecated model id) | Mock provider is the default; real provider tested in phase 2, model id in config |
| 8 | Ran out of context 4+ times mid-build | This PLAN.md plus a `PROGRESS.md` checkpoint after every phase. Build in phases; at each phase end the user commits (Claude never commits or pushes) |
| 9 | Zip command failures (OneDrive Desktop path, missing file in list) | One scripted `npm run package` that builds the zip and lists its contents |
| 10 | Late cleanups: comments, em dashes, colours, `.env.example` | Do them from the start: one-line comments only where needed, no em dashes anywhere, `.env.example` in phase 0, theme chosen up front |

---

## 1. Goal and win conditions

1. **Pass every AI scorecard on first upload**: all ~45 Musts covered, Shoulds as bonus, SAST clean, no AI-vulnerability findings.
2. **Win the 15-minute human demo**: in under a minute, a flight delay changes what a passenger sees, the passenger scans a real QR code on a phone, and revenue shows on the retailer dashboard.
3. **Near-zero cost**: open-source stack, embedded DB, mock AI by default, free hosting tier.

---

## 2. Tech stack (justified in README)

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere (strict) | One language for front, back and shared types; the reviewer can trace types end to end |
| Monorepo | npm workspaces: `apps/api`, `apps/web`, `packages/shared` | Separate frontend and backend, as required, with shared zod schemas |
| Backend | **Fastify 5** + `@fastify/swagger` (OpenAPI auto-generated) + zod | Fast, widely used, built-in schema validation, OpenAPI for free |
| Live updates | **SSE** (Server-Sent Events) for server -> client, REST for commands | Simpler than WebSockets, works through free-host proxies, auto-reconnects |
| DB | **SQLite** (better-sqlite3) + **Drizzle ORM** migrations + seed script | Embedded, no server, offline, real migrations |
| Frontend | **React 19 + Vite + Tailwind + shadcn/ui + TanStack Query + Recharts + react-i18next + Zustand** | Mainstream, fast, looks finished quickly; i18n and theming built in |
| QR | `qrcode` (server-generated SVG) | Offline, no external service |
| XML | `fast-xml-parser` (entity processing off) | AIDX parsing without XXE risk |
| AI | Provider interface: `mock` (default, template-based), `anthropic`, `openai-compatible` (covers Groq/Ollama) | Works with no key; pluggable |
| Tests | Vitest (unit + API via `fastify.inject`), Playwright (E2E + demo flow + perf) | |
| Run | `docker compose up` (2 services: `api`, `web` via nginx) **and** `npm run dev` | One command, offline |
| Deploy | Single Docker image (api serves built web) on a free host | See section 11 |

---

## 3. Architecture

```
 Source files (mock)            Adapter layer                Core (canonical model only)                 Delivery
 data/feeds/aodb_*.csv  --> FlightSource (mock-aodb|vendor-api) --\
 data/feeds/aidx/*.xml  --> FlightEventSource (mock-aidx|live)  ---+--> EventBus --> SimClock --> PresenceEngine --> DecisionEngine --> SSE hub --> web roles
 data/feeds/acris/*.json -> ZoneSource (mock-acris|fiware-live) --/                        (ZonePresence      (filter, score,       REST API --> claim page
                                                                                             per zone/5 min)   rules, validate, log)
 Platform tables (SQLite): Screen, Advertiser, Outlet, Campaign, Creative, PromoCode, Impression, Redemption, DecisionLog, Incident ...
```

Rules:
- Core never imports an adapter's source format. Adapters output canonical zod-validated entities only.
- Switching sources = one env var: `FLIGHT_SOURCE=mock-aodb|vendor-api`, `FLIGHT_EVENT_SOURCE=mock-aidx|aidx-live`, `ZONE_SOURCE=mock-acris|fiware-live`, `AI_PROVIDER=mock|anthropic|openai-compatible`.
- `Live` adapters are real classes that implement the interface and throw a clear "not configured" error with the URL/credential env vars they would need (documented in the adapter guide).
- Every input carries `source`, `observedAt`, `receivedAt`, `freshnessMs` (needed for the evidence-first pipeline).

### Repo layout
```
apps/api/src/
  adapters/  flight/ (FlightSource.ts, MockAodbFlightSource.ts, VendorApiFlightSource.ts)
             aidx/   (FlightEventSource.ts, MockAidxStream.ts, AidxLiveSource.ts, aidxParser.ts)
             acris/  (ZoneSource.ts, MockAcrisSource.ts, FiwareLiveSource.ts)
  canonical/ Flight, GateAssignment, AircraftType, FlightEvent, Terminal, Zone, Checkpoint, QueueMeasurement
  sim/       SimClock.ts, EventInjector.ts, scenarios/worked-example.ts
  presence/  ZonePresence.ts, CrowdProfile.ts, profileRules.ts
  decision/  filters.ts, scorer.ts, businessRules.ts, evidence.ts, validator.ts, llmAgent.ts, learner.ts, DecisionEngine.ts
  ai/        providers/ (mock, anthropic, openaiCompatible), creativeAssistant.ts
  modules/   admin, retailer, media, airline, passenger, claim, sim (routes + services)
  db/        schema.ts, migrations/, seed.ts
  generator/ generateDay.ts (flights, AIDX stream, ACRIS, screens, outlets, campaigns, 30-day history)
apps/web/src/
  app/ (shell, role switcher, company switcher, SimControlBar, theme, i18n)
  roles/admin | retailer | media | airline | passenger
  claim/ (mobile claim page)
  components/ (design system)
packages/shared/ (zod schemas, API types)
data/aodb-samples/ (challenge samples, untouched)   data/feeds/ (generated, committed)
docs/ architecture.md (mermaid), adapter-guide.md, openapi.json, demo-script.md, decision-pipeline.md
REQUIREMENTS_TRACEABILITY.md  SECURITY.md  PROGRESS.md  README.md  .env.example
```

---

## 4. Data model and mock generator

**Update 2026-10-24:** the official samples define a fully fictional world (airport MQI, 11 airlines, fictional cities). The generator follows it exactly; see `docs/assumptions.md`.

**Inputs we need from the challenge page (blocker):** download `aodb-samples/` (33-column AODB file with 320 flights, AIDX message, ACRIS schemas) into `data/aodb-samples/`. Our generated files must copy their columns, names and formats exactly.

Generator (`npm run generate`, seeded PRNG so output is reproducible and committed):
- **~900 flights** for one day: one row per leg, all 33 AODB columns incl. A-CDM times (TOBT, TSAT, AIBT, AOBT), stand, gate, check-in, belt, aircraft, pax, status, delay codes.
- **AIDX stream**: `IATA_AIDX_FlightLegNotifRQ` XML messages timestamped across the day (status, gate change, delay, boarding).
- **ACRIS**: NGSI-LD JSON for Terminals (T1, T2), concourses, checkpoints, zones, queues, and QueueMeasurement time series.
- **Platform data**: ~180 screens (size, orientation, zone, nearest gates with distance), 40 outlets (duty free, F&B, fashion, electronics, toys, pharmacy), 10 fictional airlines (mix of low-cost and full-service), vendors, 25 campaigns with creatives, **30 days of history** (impressions, scans, redemptions, spend).
- **Per-flight CrowdProfile** with plausible rules (route type x weekday x hour x season): trip purpose, party type, age bands, gender split, cabin/spend tier, top 3 nationalities/languages, dwell, delay, festival/holiday calendar. Unit tests assert plausibility (Mon 07:00 domestic -> business 25-44; Fri evening holiday route -> families/couples).
- All names fictional. Run a check against well-known airline and brand names.

**ZonePresence** (per zone, per 5-minute window): sum over flights at nearby gates of `pax x presenceCurve(minutesToBoarding) x gateProximityWeight`, adjusted by ACRIS queue measurements. Output: pax now, pax next 30 min, nationality/destination mix, domestic/international share, dwell distribution. Every KPI and decision reads from it.

---

## 5. Decision pipeline (the core, and the most-scored concept)

Runs per screen per slot (15 simulated seconds):

1. **Profile**: roll flight profiles up to the screen's catchment for the next slot window, weighted by gate proximity and time to boarding. Aggregated shares only.
2. **Filter** (hard rules): schedule, placement, approval status, brand safety, dom/intl, destination, min crowd, dwell, budget exhausted, stock available. Each rejection records the rule that failed.
3. **Score**: `audienceMatch` (cosine/weighted overlap of segment weights vs profile shares) x trigger boost (delay, gate change, boarding, festival) + learned conversion estimate + small exploration %.
4. **AI agent (optional, off by default)**: the forum confirmed a deterministic, explainable algorithm is enough for matching. An optional pluggable agent may re-rank the top-N and must cite evidence IDs. The real LLM effort goes into the creative assistant.
5. **Deterministic validator**: every cited evidence ID exists in the evidence store, is from a trusted feed, and is fresh enough; every hard rule passes; the score recomputes from logged inputs within tolerance. **Any failure rejects the AI choice and falls back to the rule-based winner.** The log shows "AI proposal rejected: cited evidence ev_123 not found".
6. **Business rules**: airline priority in its own boarding window, competitor separation (category adjacency), frequency cap per screen, budget pacing.
7. **Choose and log**: DecisionLog row with profile snapshot, candidates, scores, filtered list with reasons, winning rule, evidence trail, model version.
8. **Learn**: scans and redemptions per segment update each campaign's conversion estimate (Beta-Bernoulli per segment), which feeds the next score.

**Worked example golden test**: a scripted scenario (Gate 42, 14:10, XY501 to DXB 240 pax delayed 45 min + ZQ88 beach route 180 pax + one domestic flight so international comes to 57%). Forum (2026-10-24): the spec's scores are illustrative and **must not be hardcoded**. We use one documented deterministic formula (`docs/decision-pipeline.md`), and the test asserts behaviour, not exact numbers: perfume ranks first and gets the 1.5 delay boost, toys second, the lounge pass is filtered by placement, and the decision log holds profile, candidates, scores and reason. A "Load worked example" button in the sim bar reproduces it live with real computed scores.

**Demo extra (P5, nice to have)**: a "Simulate AI hallucination" inject button. The AI cites a flight that doesn't exist, the validator rejects it, and the screen falls back. Shows the safety guarantee in 10 seconds.

Performance: presence is computed once per zone per tick and cached by window, and decisions for 180 screens are pure functions over it (~1 ms). DecisionLog is batch-inserted once per second in one transaction. SSE pushes deltas, throttled to 4 Hz per topic. At 60x that is 720 decisions/s, well within budget.

---

## 6. Feature map (every Must and Should)

Shared shell (all roles): role switcher, company switcher (retailer: duty free, coffee chain, ...; airline: low-cost, full-service), **SimControlBar** (play/pause, 1x/10x/60x, jump to time, inject: delay flight, gate change, screen offline, hallucination, load worked example), one live sim clock, EN + second language, light theme for business roles, dark "control room" theme for Admin, **Split-screen demo mode** (passenger left, any role right), "Why this ad?" available everywhere.

### Platform Admin (dark)
- M: Live network map, SVG T1/T2 floor plan, 180 screen dots (online/degraded/offline), presence heat overlay, click a dot for screen detail and last decision
- M: KPI strip: screens online %, plays today, impressions, revenue (configurable currency), active campaigns, avg latency
- M: Incident tracker: auto-raised (screen offline > 5 min, feed lag, failed creative), severity, owner, status, edit
- M: Master data CRUD (list + create/edit forms with validation) for **vendors, outlets/F&B retailers, airlines, locations (terminal/zone/gate), screens**
- M (matching): Rule engine settings (global weights, exploration %, frequency caps, competitor separation), searchable decision log, segment model version
- S: Feed health (AODB/AIDX/ACRIS status, msgs/min, last message, adapter in use)
- S: Performance panel (API p95, playlist build time, 7-day uptime)

### Retailer (light)
- M: Live dashboard (impressions, scans, redemptions, conversion, attributed revenue, ticking)
- M: Passenger flow near my store, next 2 h ("Next 60 min: 1,240 pax, 38% intl, top: DXB, LHR, SIN")
- M: Campaign builder: creative, zones/screens, audience rules, segment weights, triggers, schedule, budget, **live audience-match preview** ("matches 64%... expected 3,100 impressions, 95 redemptions"), mock screen preview
- M: Creative library (upload image, templates, reuse), duplicate past campaign in one click
- M: Promo codes: time-boxed, expiring at the linked flight's boarding close, QR, share-to-family second code
- M: Campaign history: spend, impressions, redemptions, ROI, "Run again"
- M (matching): Performance by segment ("families redeemed 3x more") + suggested weight changes
- S: Trigger rules, stock-aware pause toggle, budget pacing + A/B creative comparison
- WOW: GenAI creative assistant (brief -> ad in template, EN + second language); "Best 3 slots tomorrow" with predicted impressions

### Media Manager (light)
- M: Inventory calendar, screen x hour: booked / available / premium
- M: Yield and pricing: suggested price per slot from predicted presence, occupancy %, 7-day revenue forecast
- M: Approval queue with approve/reject and brand-safety checklist
- M: Advertiser overview: top by spend, running campaigns, under-delivery flagged
- M (matching): Segment heatmap (segment x hour x zone), conflict view (why A beat B), manual pin/override with reason
- S: Package builder ("International departures premium pack"), one-click advertiser report (shareable link + print-to-PDF)

### Airline Representative (light)
- M: My flights today, list + timeline (gate, status, delay, load factor)
- M: Gate-area messaging scheduled to my boarding window (upgrade, lounge, destination partners)
- M: Delay goodwill automation: threshold -> auto-push a voucher co-funded with an F&B retailer to gate screens
- M (matching): Aggregated crowd profile of my flights, partner offers ranked by fit, what played at my gates and why
- S: Co-marketing marketplace (accept in one click), performance among own passengers

### Passenger screen simulator
- M: Full-screen view of a chosen screen (by gate/zone), 9:16 or 16:9 frame
- M: FIDS-style context strip of nearby flights
- M: Dynamic ad selection that visibly changes with sim time, boarding, delays
- M: Promo QR with live countdown -> **real phone** opens the mobile claim page (QR encodes `PUBLIC_BASE_URL`, auto-detected LAN IP locally, the playground URL when deployed) -> records a Redemption -> retailer dashboard updates instantly
- M: "Why this ad?" overlay (profile bars, top 3 candidates with scores, winning rule)

### Cross-cutting
- Cause and effect in under 2 s: injected AIDX delay -> airline view updates, gate screens re-plan, retailer delay rule fires, zone pax rises. A Playwright test measures it.
- Theme config (`theme.json`: name, logo, colours), no real marks. i18n for UI and ad content.
- Responsive at 1440 and 1920; mobile layout for the claim page.

---

## 7. Build phases (each ends with tests green + PROGRESS.md update + handover; the user commits and pushes)

| Phase | Scope | Exit check |
|---|---|---|
| **P0 Foundation** | git init, monorepo, lint/tsc strict, `.env.example`, theme + i18n scaffolding, OpenGrep running in Docker, CI script `npm run verify`, traceability skeleton listing all requirements | `npm run verify` passes on an empty app; OpenGrep 0/0 |
| **P1 Data + adapters** | Canonical zod model, generator, committed feed files, 3 adapter interfaces + mock + live stubs, DB schema, migrations, seed | Adapter tests parse the official samples; generator counts match (900/180/40/10/25/30 days) |
| **P2 Engine** | SimClock, EventInjector, ZonePresence, CrowdProfile, full decision pipeline, validator, learner, SSE hub, AI provider interface | Golden worked-example test; validator rejects hallucinations; 60x engine benchmark |
| **P3 Vertical slice (WOW spine)** | Shell, SimControlBar, Passenger screen, Why-this-ad, QR + claim page, minimal retailer live dashboard, split-screen. **Deploy to playground now** | Phone scan on LAN works; Playwright: inject delay -> ad changes -> claim -> retailer tick < 2 s; playground URL live |
| **P4 Role dashboards** | All Musts for Admin, Retailer, Media Manager, Airline | Each Must has a UI path + test + traceability row |
| **P5 WOW extras** | GenAI creative assistant, smart slot recommendation, hallucination demo, guided demo mode ("Run demo script" auto-steps), polish | Demo script runs start to finish in < 15 min |
| **P6 Shoulds** | All Should items | Traceability complete |
| **P7 Hardening + submission** | SAST pass, AI-vuln review, perf test, a11y basics, docs (README, architecture diagram, adapter guide, OpenAPI, demo script), clean-clone `docker compose up` test, package zip, playground smoke, video script | Pre-submission gate (section 10) all green |

Order principle: build the vertical slice that shows the demo first, deploy it early, then widen. Don't leave hosting or the real-phone QR to the end.

---

## 8. Testing strategy

- Unit: profile plausibility, presence math, each hard filter, scorer, business rules, validator (missing / stale / untrusted evidence, score mismatch), learner, AIDX/AODB/ACRIS parsers against official samples.
- Golden: the worked example table, exact values.
- API: every route via `fastify.inject`, including zod validation failures.
- E2E (Playwright): one test per role covering each Must; full demo flow; latency assertion (< 2 s); 60x run for 2 minutes with frame-time check.
- Smoke against the deployed playground URL before each submission.
- I run all tests myself and report actual results.

---

## 9. Security / SAST rules (write it right the first time)

Patterns that cost us last time, and what to use instead:
- `obj[variableKey]` (detect-object-injection) -> use `Map`, typed records with literal unions, or `Object.hasOwn` guarded helpers
- `Math.random()` -> seeded PRNG (mulberry32) for the generator; `crypto.randomUUID()` / `crypto.randomInt()` for codes
- `dangerouslySetInnerHTML` -> never. Creatives render as React template components from structured JSON, not HTML strings
- `^`/`~` versions -> exact versions in every package.json; lockfile committed
- `fetch(variableUrl)` (SSRF) -> AI provider URLs are constants chosen by provider enum
- Secrets in URL params -> headers only; no secrets in repo; `.env.example` only
- Also: helmet headers, rate limiting (`@fastify/rate-limit`) on claim + AI endpoints, CORS allow-list, zod on every input, Drizzle parameterized queries only, XML entity expansion disabled, upload type/size checks (images only, re-encoded or sniffed), no `eval`/`new Function`, no `console.log` in prod code, error handler that doesn't leak stack traces
- Docker: non-root `USER`, pinned base image tags, `security_opt: no-new-privileges`, `read_only` filesystem with a tmpfs/volume for SQLite, no privileged mode
- AI-specific: GenAI brief input length limits, prompt-injection guard (system prompt + output schema validation), LLM output never executed and only shown after schema validation; decision LLM output only acts through the validator
- `nosemgrep` only for verified false positives, each with a one-line reason, listed in SECURITY.md

---

## 10. Pre-submission gate (run every upload)

1. `npm run verify` = tsc + lint + unit + API tests
2. Playwright E2E + demo flow + perf, all green
3. OpenGrep `--config=r/all`: 0 ERROR, 0-3 WARNING; `npm audit` no high/critical
4. Fresh clone in a temp dir -> `docker compose up` -> app works offline
5. Sweeps: no em dashes, no TODO/console.log, no real brand/airport names, comments one-line only
6. Every row in REQUIREMENTS_TRACEABILITY.md points to existing files and passing tests
7. `npm run package` -> `git archive` zip with files at root; print listing; confirm no node_modules, .env, dist
8. Playground smoke test passes; URL and demo video link in README and the submission notes

---

## 11. Hosting the playground (THE demo)

Forum (2026-10-23): the playground URL is mandatory. Leadership will review and demo **only** the deployed site and will not run Docker. Docker is still a deliverable. So the playground must be preconfigured, reliable and always on for the whole review period.

Needs: always on during review, SSE/long connections, persistent SQLite, public HTTPS URL for the QR.
- **Budget: zero.** No paid services, no card-on-file trials (decided 2026-10-24).
- **Primary: Hugging Face Spaces (Docker SDK, free CPU tier).** 2 vCPU / 16 GB RAM, public HTTPS URL, supports SSE, no card needed. It sleeps after ~48 h without visits, so a free UptimeRobot monitor pings it every 5 min. Storage is ephemeral: the app regenerates and reseeds on boot (deterministic seed), so a restart always lands on the demo-ready state.
- **Backup mirror: Render free web service from the same image**, also kept awake by UptimeRobot (750 free hours/month covers one service 24/7; 512 MB RAM). A second URL in the README so a reviewer always has a working link.
- Design for small machines anyway: DecisionLog kept as a bounded ring buffer in memory plus batched SQLite writes, SSE throttled, no heavy native services.
- Deploy in P3 and auto-deploy on push from then on.

---

## 12. Demo (15 minutes) and video

Guided "Demo mode" button steps through:
1. Admin control room: network map, heat, KPIs, feed health (1.5 min)
2. Split screen: passenger at Gate 42 + retailer. Load worked example -> perfume plays -> open "Why this ad?" (2 min)
3. Inject AIDX delay on XY501 -> airline view, gate re-plan, goodwill voucher, retailer trigger, pax rises, all < 2 s (2 min)
4. Scan QR with a real phone -> claim -> share-to-family code -> retailer revenue ticks (1.5 min)
5. Hallucination inject -> validator rejects -> fallback (1 min)
6. Retailer: GenAI creative in EN + second language, audience preview, best 3 slots (2 min)
7. Media Manager: inventory calendar, yield, approvals, heatmap, override (2 min)
8. Airline: my flights, gate messaging, marketplace (1.5 min)
9. Adapter story: switch `FLIGHT_SOURCE`, show adapter guide (1 min)

`docs/demo-script.md` holds the narration; the video is recorded from it (aim for ~5 min highlight cut).

---

## 13. Open questions for you

1. **Deadline**: when does the challenge close? This sets how much of P6 we can do.
2. **Sample files**: download `Playground.zip` from the forum post and extract it into `data/aodb-samples/`. It holds the AODB dataset, the AIDX message and a README (no ACRIS folder: we use the public FIWARE dataModel.ACRIS, as the forum confirmed).
3. **Second language**: recommend **Hindi** (the "festive sweets, families flying domestic" brief suggests India; LTR keeps layout simple). Arabic would be a strong Gulf signal but RTL adds work.
4. **Hosting**: free only. Hugging Face Spaces (primary) + Render free (backup), both kept awake by UptimeRobot. You will need free accounts on Hugging Face, Render and UptimeRobot by Phase 3.
5. **Product name**: Dwellcast (chosen 2026-10-23; no airport-media conflicts found).

---

## 14. Forum clarifications (2026-10-23/24) and how we apply them

| Topic | Answer | Our decision |
|---|---|---|
| Worked example scores | Illustrative; deterministic documented formula; never hardcode | Test asserts ranking, filters, boosts and logging, not exact numbers |
| Many phones, one QR | Each phone may get its own code and redemption; caps optional | Per-scan codes; configurable per-offer cap and duplicate-claim protection in the campaign builder |
| Code stored on phone | localStorage allowed; no fingerprinting, identity tracking or profiling | Claim page keeps its issued code in localStorage only; server stores nothing about the device |
| LLM per decision | Not required; deterministic explainable algorithm is fine | Deterministic scorer + evidence validator; LLM used for the creative assistant |
| ACRIS samples | Use public FIWARE dataModel.ACRIS; build representative NGSI-LD mocks | Mock ACRIS entities follow the FIWARE schemas and go through the ACRIS adapter |
| Inventory | Booked = capacity allocated to approved campaigns; available = unallocated; premium = high predicted presence | Price unit: **per screen-hour** (240 plays of 15 s), also shown per 15-second play |
| Sub-pages | Tabs, drawers, modals and panels do not count as sub-pages | Max 1 dashboard + 3 sub-pages per role; detail goes in tabs and drawers |
| Money | Admin revenue = platform ad revenue; retailer attributed = simulated sales linked to redemptions; ROI = (attributed - spend) / spend | All definitions written in `docs/assumptions.md` and used everywhere |
| Playground | Mandatory; leadership uses only the deployed site | Hosting is a P3 deliverable, not P7; free only (HF Spaces + Render backup); see section 11 |
