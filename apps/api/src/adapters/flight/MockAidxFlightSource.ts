import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { FlightEvent } from '@dwellcast/shared';
import { parseAidxXml } from '../../formats/aidxXml.ts';
import { parseAodbRows } from '../../formats/aodbCsv.ts';
import { aidxToFlightEvent, FlightIndex } from '../aidx/aidxAdapter.ts';
import { aodbRowsToSnapshot } from '../aodb/aodbAdapter.ts';
import { readJsonLines } from '../jsonl.ts';
import type { AdapterContext, FlightSnapshot, FlightSource } from '../types.ts';

const envelopeSchema = z.object({ deliverAt: z.iso.datetime(), xml: z.string().min(1).max(64_000) });

export interface MockAidxFiles {
  aodbSnapshot: string;
  aidxStream: string;
}

// FLIGHT_SOURCE=mock-aidx: AODB CSV snapshot for the schedule, then the simulated AIDX XML feed for live updates
export class MockAidxFlightSource implements FlightSource {
  readonly name = 'mock-aidx';
  private index: FlightIndex | null = null;
  unresolved = 0;

  constructor(
    private readonly files: MockAidxFiles,
    private readonly ctx: AdapterContext,
  ) {}

  async snapshot(): Promise<FlightSnapshot> {
    const rows = parseAodbRows(await readFile(this.files.aodbSnapshot, 'utf8'));
    const snapshot = aodbRowsToSnapshot(rows, this.ctx);
    this.index = new FlightIndex(snapshot.flights, this.ctx.homeAirport);
    return snapshot;
  }

  async *stream(): AsyncIterable<FlightEvent> {
    if (!this.index) await this.snapshot();
    const index = this.index;
    if (!index) return;
    for await (const record of readJsonLines(this.files.aidxStream)) {
      const envelope = envelopeSchema.parse(record);
      const notification = parseAidxXml(envelope.xml);
      const flight = index.resolve(notification.leg);
      if (!flight) {
        this.unresolved++;
        continue;
      }
      yield aidxToFlightEvent(notification, flight, this.ctx);
    }
  }
}
