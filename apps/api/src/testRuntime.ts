import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAirportConfig } from './airportConfig.ts';
import { loadConfig } from './config.ts';
import type { EngineSettings } from './decision/settings.ts';
import { Runtime } from './runtime/Runtime.ts';

// Test helper: a paused runtime on its own temporary database, exploration off so choices are fully deterministic
export function createTestRuntime(settings: Partial<EngineSettings> = {}): Promise<Runtime> {
  const dir = mkdtempSync(join(tmpdir(), 'dwellcast-rt-'));
  return Runtime.create({
    config: loadConfig({ NODE_ENV: 'test' }),
    airport: loadAirportConfig(),
    dbFile: join(dir, 'test.sqlite'),
    startTime: '13:50',
    autoPlay: false,
    settings: { explorationPct: 0, ...settings },
  });
}
