# Assumptions and definitions

Every number on every dashboard follows these definitions. Forum clarifications from 2026-10-23/24 are marked **(forum)**.

## The airport world

- The airport is the fictional **Meridian International (MQI)** from the challenge samples (`data/aodb-samples/README.md`): T1 and T2, 11 fictional airlines, 15 domestic and 7 international fictional cities, aircraft registrations with the unused `Q` prefix.
- Nationalities are fictional and use the ISO 3166 user-assigned `X*` codes (for example `XM` Meridian, `XZ` Zarhani), so no real country is profiled.
- All times are UTC, like the sample files. `config/airport.json` holds the operating date (2026-11-06, a Friday in a festival period) and the generator seed.
- The spec asks for 10 airlines; the official sample lists 11. We use all 11 so our data stays consistent with the reference files.

## Worked example mapping

The spec's Gate 42 example uses flights XY501 (DXB) and ZQ88 (a beach destination). Those carriers and cities are not in the sample world, so the generator relabels them:

| Spec | Our data | Why |
|---|---|---|
| XY501 to DXB, 240 pax, delayed 45 min | **XH501** Halcyon Airways to **Zarhan (ZHQ)**, Gate 42, 240 pax, delay code 93, ETD 15:40 | Halcyon is the sample's Gulf-hub carrier and ZHQ its Gulf-region city |
| ZQ88 to a beach destination, 180 pax | **XD881** Skylark Air to **Solmara (SMG)**, Gate 44, 180 pax | Solmara is the sample's international beach city served by Skylark |
| (domestic share implied by "international 57%") | **YA233** Aurora National to Oakridge (OKZ), Gate 43, 290 pax | Adds the domestic crowd so the zone is mixed |

The scores in the spec table are **illustrative (forum)**. Ours come from one documented, deterministic formula (`docs/decision-pipeline.md`, Phase 2) and are never hardcoded. Tests assert the behaviour: perfume ranks first with the 1.5 delay boost, toys second, and the lounge pass is filtered out because it is only placed on Central Pier screens.

## Money **(forum)**

| Metric | Definition |
|---|---|
| Admin "revenue today" | Platform ad revenue: sum over today's plays of the campaign's price per play |
| Retailer "revenue attributed" | Simulated sales linked to redemptions: each redemption's basket value (outlet average basket with seeded variation) |
| ROI | (attributed revenue - campaign spend) / campaign spend |
| Spend | Plays x price per play, capped by the campaign's daily cap |

## Inventory and pricing **(forum)**

- **Booked**: screen capacity allocated to approved or active campaigns. **Available**: unallocated capacity. **Premium**: capacity with high predicted passenger presence (or premium screens: retail zones and 75 inch or larger).
- **Price unit: per screen-hour**, which is 240 plays of 15 seconds. The per-play price is also shown.

## Promo codes **(forum)**

- Every phone that scans gets its own code and redemption. A per-offer cap and duplicate-claim protection are optional campaign settings.
- The claim page may keep its issued code in the browser's local storage so a refresh does not create a second one. Nothing about the device is stored on the server: no fingerprinting, no identity, no profiling.

## Privacy

Crowd profiles are aggregated shares per flight, zone and 5-minute window ("62% holiday travellers"). There is no per-passenger data anywhere in the system.

## Queue measurements

ACRIS `WaitTime` and `ProjectedWaitTime` are in seconds and `Throughput` is passengers per hour, matching the magnitudes in the FIWARE examples. Floor-plan positions use `AirportLocation` with `Srid: 0` (local plan coordinates: `Longitude` = x, `Latitude` = y).
