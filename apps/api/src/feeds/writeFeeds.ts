import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildAidxXml } from '../formats/aidxXml.ts';
import { writeAodbCsv } from '../formats/aodbCsv.ts';
import type { GeneratedDay } from '../generator/index.ts';
import { feedFiles } from './paths.ts';

const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

function write(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

export function writeFeeds(day: GeneratedDay, airportCode: string): ReturnType<typeof feedFiles> {
  const files = feedFiles(airportCode, day.date);
  write(files.aodbStartOfDay, writeAodbCsv(day.aodbStartOfDay));
  write(files.aodbEndOfDay, writeAodbCsv(day.aodbEndOfDay));
  write(files.aidxStream, day.aidx.map((m) => JSON.stringify({ deliverAt: iso(m.deliverAt), xml: buildAidxXml(m.notification) })).join('\n') + '\n');
  write(files.acrisEntities, JSON.stringify(day.acris.entities, null, 2) + '\n');
  write(files.acrisMeasurements, day.acris.measurements.map((m) => JSON.stringify({ deliverAt: iso(m.deliverAt), entity: m.entity })).join('\n') + '\n');

  // Readable examples: every AIDX message for the worked-example flight XH501
  const examples = day.aidx.filter((m) => m.notification.leg.airline === 'XH' && m.notification.leg.flightNumber === '501');
  examples.forEach((m, i) => {
    const status = m.notification.publicStatus ?? m.notification.operationalStatus ?? 'UPD';
    write(join(files.aidxExamples, `XH501_${String(i + 1).padStart(2, '0')}_${status}.xml`), buildAidxXml(m.notification) + '\n');
  });
  return files;
}
