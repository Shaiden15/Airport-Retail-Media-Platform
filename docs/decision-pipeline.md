# Decision pipeline

Every ad slot on every screen (every 15 simulated seconds) goes to the campaign whose target audience best matches the crowd expected in front of that screen. Every input is a recorded data point with a source and timestamp, every decision is logged with its evidence, and nothing an AI asserts reaches a screen unless deterministic checks confirm it.

Code: `apps/api/src/decision/` (engine, scorer, eligibility, validator, agent, learner, ledger), `apps/api/src/presence/` (presence and crowd).

## 1. Passenger presence (the derived signal)

`PresenceEngine` turns canonical flights and ACRIS queue measurements into a **ZonePresence** per zone and 5-minute window: passengers now and over the next 30 minutes, international share, top destinations and nationalities, median dwell, and the contributing flights. Curves (`presence/curves.ts`):

| Zone kind | Who is there |
|---|---|
| Gate area | Passengers arrive by the **scheduled** time (from 90 to 40 min before) and leave by the **estimated** time (boarding from 40 to 15 min before). A delay therefore keeps them at the gate longer and raises the zone count. |
| Retail plaza / duty free | Passengers between security and the gate (peak about 95 min before), plus delayed passengers drifting back to the shops. |
| Security | ACRIS queue occupancy plus passengers heading through security. |
| Landside | Check-in (about 2.5 h before) and arrivals meeting the plane. |

Dwell = minutes until boarding completes (estimated departure minus 15).

## 2. Crowd profile per screen

Each flight has an aggregated crowd profile (`profiles/crowdProfile.ts`: trip purpose, party, age bands, gender, cabin, frequent flyers, nationalities, languages). A screen's crowd is the sum of flight profiles weighted by effective passengers:

- **Gate screens**: flights at the screen's nearest gates, weight `exp(-distance_m / 120)` times the gate presence curve.
- **Other screens**: their zone's crowd, shared across the screens in that zone.

All values are shares ("58% holiday"); there is no per-passenger data.

## 3. Hard filters

A campaign is removed, with the failing rule recorded, if any of these fail (`decision/eligibility.ts`): status, creative approval, brand safety, schedule (dates and daily hours), placement (zones, screens or gates), domestic/international, destination region or airport, minimum dwell, minimum crowd, budget (total or daily cap), stock (outlet out of stock), required trigger not active.

## 4. Score (deterministic, documented)

Segment weights are grouped by dimension: scope (international/domestic), trip purpose, party, age, cabin, gender, loyalty.

```
affinity(group) = sum over weighted segments in group of (weight x crowd share) / max weight in group
match           = sum(groupWeight x affinity) / sum(groupWeight)           groupWeight = max weight in the group
learnLift       = campaign's learned conversion for this crowd / its own average, clamped to 0.85..1.15
adjusted        = min(1, match x learnLift)
boost           = product of fired trigger boosts (delay, gate change, boarding, festival), capped at 3
score           = (1 - (1 - adjusted) ^ boost) x pacing
pacing          = clamp(1 + 0.5 x (share of daily hours elapsed - share of daily cap spent), 0.6, 1.2)
```

A boost compounds the chance of attention rather than pushing the score past 1. For the spec's example numbers (71% match, 1.5 boost) this formula gives 0.84, close to the spec's illustrative 0.86. The forum confirmed those numbers are illustrative; scores here are always computed, never hardcoded.

## 5. Business rules (in order)

1. **Manual pin** by the Media Manager (with a reason and an expiry).
2. **Delay goodwill**: a campaign whose trigger is `required` and `delay >= N` takes over screens within 120 m of the delayed flight's gate (auto-push, not auctioned).
3. **Airline priority**: an airline's campaign wins screens beside its own flight during that flight's boarding window.
4. **Competitor separation**: no two campaigns from different advertisers in the same category back to back on a screen.
5. **Frequency cap**: at most `min(campaign cap, global cap)` plays per screen per hour.
6. **Budget pacing**: applied inside the score.
7. **Exploration**: a deterministic hash of screen and slot sends a configurable share of plays (default 5%) to the runner-up, so the learner keeps measuring alternatives.

## 6. AI proposal and deterministic validation

The pluggable agent (`decision/agent.ts`, default `mock-ranker`, `AI_PROVIDER`) proposes a winner and must cite evidence ids. `decision/validator.ts` then checks:

| Check | Rule |
|---|---|
| evidence-exists | every cited id resolves against the live state (a flight with that exact provenance, a queue measurement that exists) |
| evidence-trusted | source is one of AODB, AIDX, ACRIS, platform |
| evidence-fresh | AODB within 36 h, AIDX within 12 h, ACRIS within 15 min of simulation time (configurable) |
| hard-rules | the proposed campaign passes every hard filter |
| score-reproducible | the score recomputed from the logged inputs equals the claimed score |

Any failure rejects the proposal and the rule-based winner plays (`source: rule-based`). The demo's "Simulate AI hallucination" control makes the agent cite a non-existent flight to show this live.

## 7. Choose, log and learn

Each decision stores the crowd profile, every candidate with its breakdown or filter reason, fired triggers with the flight that fired them, the winner, the winning rule in plain words, the agent proposal and validation result, and the full evidence trail. The last 50,000 decisions stay in memory for "Why this ad?" and the searchable log; winner changes and hourly play totals are written to SQLite.

The learner keeps a Beta-Bernoulli conversion estimate per campaign and segment, primed from 30 days of history; every redemption updates it, so later decisions favour segments that actually convert.

## Worked example (reproducible)

`POST /api/sim/scenario/worked-example` jumps to 14:10 and pauses. On the screen closest to Gate 42 the crowd is XH501 to Zarhan (240 pax, delayed 45 min), XD881 to Solmara (180 pax) and YA233 to Oakridge. The duty-free perfume offer wins with the 1.5 delay boost citing XH501, toys score lower, and the business lounge pass is filtered by placement (it is booked only on Central Pier screens). Injecting a 75-minute delay on XH501 crosses the goodwill threshold and the coffee voucher takes over the gate screens within milliseconds. Tests: `apps/api/src/runtime/runtime.test.ts`.
