import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

export function feedsDir(): string {
  return process.env.FEEDS_DIR ?? join(REPO_ROOT, 'data', 'feeds');
}

export function runtimeDbFile(): string {
  return process.env.DATABASE_FILE ?? join(REPO_ROOT, 'data', 'runtime', 'dwellcast.db');
}

export function webDistDir(): string {
  return process.env.WEB_DIST_DIR ?? join(REPO_ROOT, 'apps', 'web', 'dist');
}

export function samplesDir(): string {
  return join(REPO_ROOT, 'data', 'aodb-samples');
}

export function feedFiles(airportCode: string, date: string) {
  const root = feedsDir();
  return {
    root,
    aodbStartOfDay: join(root, 'aodb', `${airportCode}_aodb_flights_${date}_start-of-day.csv`),
    aodbEndOfDay: join(root, 'aodb', `${airportCode}_aodb_flights_${date}_SYNTHETIC.csv`),
    aidxStream: join(root, 'aidx', `${airportCode}_aidx_stream_${date}.jsonl`),
    aidxExamples: join(root, 'aidx', 'examples'),
    acrisEntities: join(root, 'acris', `${airportCode}_acris_entities.jsonld`),
    acrisMeasurements: join(root, 'acris', `${airportCode}_acris_queue_measurements_${date}.jsonl`),
  };
}
