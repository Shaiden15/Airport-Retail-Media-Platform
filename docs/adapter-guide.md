# Data adapter guide

Going live with a real airport feed means writing **one new adapter** and changing **one config value**. Nothing in the core changes, because the core only ever sees the canonical model in `packages/shared/src/canonical/`.

## How data flows

```
source format                adapter (translate)                         canonical model          core
AODB CSV / vendor API  --->  adapters/aodb/aodbAdapter.ts      --->  Flight, GateAssignment,   --->  simulation,
                                                                         AircraftType                 presence,
AIDX XML messages      --->  adapters/aidx/aidxAdapter.ts      --->  FlightEvent                      decisions,
                                                                                                       dashboards
ACRIS NGSI-LD JSON     --->  adapters/acris/acrisAdapter.ts    --->  Terminal, Zone, Checkpoint,
                                                                         PassengerQueue, QueueMeasurement
```

Every canonical record carries `provenance` (`source`, `sourceRef`, `adapter`, `observedAt`, `receivedAt`). The decision engine uses it to check that every fact it cites came from a trusted feed and is fresh enough.

## The two contracts

```ts
interface FlightSource {
  readonly name: string;
  snapshot(): Promise<{ flights: Flight[]; gateAssignments: GateAssignment[]; aircraftTypes: AircraftType[] }>;
  stream(): AsyncIterable<FlightEvent>;
}

interface ZoneSource {
  readonly name: string;
  snapshot(): Promise<{ terminals: Terminal[]; concourses: Concourse[]; zones: Zone[]; checkpoints: Checkpoint[]; queues: PassengerQueue[] }>;
  stream(): AsyncIterable<QueueMeasurement>;
}
```

Defined in `apps/api/src/adapters/types.ts`. The single place that picks an implementation is `apps/api/src/adapters/registry.ts`.

## Switching sources

| Setting | Values | Default |
|---|---|---|
| `FLIGHT_SOURCE` | `mock-aidx` (AODB CSV snapshot + simulated AIDX XML feed), `vendor-api` (live stub) | `mock-aidx` |
| `ZONE_SOURCE` | `mock-acris` (NGSI-LD files), `fiware-live` (live stub) | `mock-acris` |

The live stubs (`VendorApiFlightSource`, `FiwareLiveZoneSource`) implement the same interfaces and fail with a clear message naming the settings a real connection needs.

## Writing a live adapter (example: your AODB vendor's REST API)

1. Create `apps/api/src/adapters/flight/MyVendorFlightSource.ts` implementing `FlightSource`.
2. In `snapshot()`, fetch the day's movements and map each record to the vendor-neutral `AodbRow` shape, then call `aodbRowsToSnapshot(rows, ctx)`. If the vendor's fields differ a lot, map straight to `Flight` and validate with `flightSchema.parse`.
3. In `stream()`, subscribe to the AIDX broker (or webhook) and for each message call `parseAidxXml(xml)`, resolve the flight with `FlightIndex`, then yield `aidxToFlightEvent(...)`.
4. Add the value to the `FLIGHT_SOURCE` enum in `apps/api/src/config.ts` and one `case` in `registry.ts`.
5. Run the adapter tests. `apps/api/src/adapters/samples.test.ts` shows the expected canonical output for the official sample files.

The same pattern applies to ACRIS: a FIWARE Orion-LD subscription delivers NGSI-LD entities, and `AcrisTranslator` turns them into canonical locations and measurements.

## Reference fixtures

| File | Used by |
|---|---|
| `data/aodb-samples/MQI_aodb_flights_2026-10-14_SYNTHETIC.csv` | AODB adapter tests (320 rows, 33 columns) |
| `data/aodb-samples/AIDX_FlightLegNotifRQ_XH960_arrival_ILLUSTRATIVE.xml` | AIDX parser and flight-resolution tests |
| `data/reference/acris/*.jsonld` | ACRIS adapter tests against the public FIWARE examples |
