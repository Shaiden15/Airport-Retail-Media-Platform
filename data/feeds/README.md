# Generated feeds

One operating day at Meridian International (MQI), produced by `npm run generate --workspace apps/api` from `config/airport.json` (same seed, same output). Each file is in the real source format and is read only through its adapter.

| File | Format | Contents |
|---|---|---|
| `aodb/MQI_aodb_flights_<date>_start-of-day.csv` | AODB CSV, the 33 sample columns | The schedule as known at the start of the day (status `SCH`, no actuals). The simulation loads this. |
| `aodb/MQI_aodb_flights_<date>_SYNTHETIC.csv` | AODB CSV, the 33 sample columns | The same day after it ran (actuals, `ARR`/`DEP`/`CNL`), shaped exactly like the challenge sample |
| `aidx/MQI_aidx_stream_<date>.jsonl` | JSON Lines, one `{deliverAt, xml}` per line | IATA AIDX `FlightLegNotifRQ` messages in delivery order: delays, gate changes, boarding, final call, gate closed, off-block, take-off, estimates, landing, on-block |
| `aidx/examples/XH501_*.xml` | AIDX XML | Every message for the worked-example flight, for easy reading |
| `acris/MQI_acris_entities.jsonld` | NGSI-LD normalized | ACRIS terminals, concourses, zones, checkpoints and passenger queues |
| `acris/MQI_acris_queue_measurements_<date>.jsonl` | JSON Lines, one `{deliverAt, entity}` per line | ACRIS `QueueMeasurement` every 5 minutes for each queue |

Scale: 900 flight legs (450 arrival/departure pairs), about 3,700 AIDX messages, 1,440 queue measurements.
