import { loadAirportConfig } from './airportConfig.ts';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';
import { runtimeDbFile } from './feeds/paths.ts';
import { Runtime } from './runtime/Runtime.ts';

const config = loadConfig();
const runtime = await Runtime.create({ config, airport: loadAirportConfig(), dbFile: runtimeDbFile(), startTime: config.SIM_START, autoPlay: config.SIM_AUTOPLAY });
const app = await buildApp(config, runtime);

try {
  await app.listen({ host: config.HOST, port: config.PORT });
  runtime.start();
} catch (error) {
  app.log.fatal({ err: error }, 'failed to start');
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    runtime.stop();
    void app.close().then(() => process.exit(0));
  });
}
