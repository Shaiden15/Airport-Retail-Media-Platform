import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { QueueMeasurement } from '@dwellcast/shared';
import type { NgsiEntity } from '../../formats/acrisNgsi.ts';
import { readJsonLines } from '../jsonl.ts';
import type { AdapterContext, ZoneSnapshot, ZoneSource } from '../types.ts';
import { AcrisTranslator } from './acrisAdapter.ts';

const entitySchema = z.looseObject({ id: z.string().min(1), type: z.string().min(1) });
const envelopeSchema = z.object({ deliverAt: z.iso.datetime(), entity: entitySchema });

export interface MockAcrisFiles {
  entities: string;
  measurements: string;
}

// ZONE_SOURCE=mock-acris: NGSI-LD entity files shaped like the FIWARE dataModel.ACRIS examples
export class MockAcrisZoneSource implements ZoneSource {
  readonly name = 'mock-acris';
  private readonly translator: AcrisTranslator;
  private loaded = false;

  constructor(
    private readonly files: MockAcrisFiles,
    private readonly ctx: AdapterContext,
  ) {
    this.translator = new AcrisTranslator(ctx);
  }

  async snapshot(): Promise<ZoneSnapshot> {
    const entities = z.array(entitySchema).parse(JSON.parse(await readFile(this.files.entities, 'utf8'))) as NgsiEntity[];
    this.loaded = true;
    return this.translator.snapshot(entities, this.ctx.now());
  }

  async *stream(): AsyncIterable<QueueMeasurement> {
    if (!this.loaded) await this.snapshot();
    for await (const record of readJsonLines(this.files.measurements)) {
      const envelope = envelopeSchema.parse(record);
      yield this.translator.measurement(envelope.entity as NgsiEntity);
    }
  }
}
