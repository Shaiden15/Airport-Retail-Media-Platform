import { loadAirportConfig } from '../airportConfig.ts';
import { migrate, openDatabase } from '../db/database.ts';
import { seedDatabase } from '../db/seed.ts';
import { runtimeDbFile } from '../feeds/paths.ts';
import { buildLayout } from '../generator/layout.ts';
import { generatePlatform } from '../generator/platform.ts';

const airport = loadAirportConfig();
const file = runtimeDbFile();
const db = openDatabase(file);
const ran = migrate(db);
const layout = buildLayout();
const platform = generatePlatform(layout, { date: airport.operatingDate, seed: airport.seed });
seedDatabase(db, layout, platform, { reset: true });
const counts = db.prepare('SELECT (SELECT COUNT(*) FROM screens) AS screens, (SELECT COUNT(*) FROM outlets) AS outlets, (SELECT COUNT(*) FROM campaigns) AS campaigns, (SELECT COUNT(*) FROM campaign_daily_stats) AS stats').get() ?? {};
process.stdout.write(
  `database ${file}\n  migrations applied: ${ran.length ? ran.join(', ') : 'none (up to date)'}\n  seeded: ${String(counts.screens)} screens, ${String(counts.outlets)} outlets, ${String(counts.campaigns)} campaigns, ${String(counts.stats)} daily stats\n`,
);
db.close();
