// AODB flight-movement CSV format, column for column as in data/aodb-samples/MQI_aodb_flights_2026-10-14_SYNTHETIC.csv
export const AODB_COLUMNS = [
  'aodb_flight_id',
  'linked_flight_id',
  'direction',
  'airline_iata',
  'airline_icao',
  'flight_number',
  'callsign',
  'service_type',
  'flight_nature',
  'origin',
  'destination',
  'via',
  'terminal',
  'STA_STD',
  'ETA_ETD',
  'ELDT_ETOT',
  'ALDT_ATOT',
  'AIBT_AOBT',
  'TOBT',
  'TSAT',
  'stand',
  'gate',
  'checkin_counters',
  'baggage_belt',
  'aircraft_reg',
  'aircraft_type_icao',
  'seats',
  'pax_total',
  'status',
  'delay_codes',
  'codeshares',
  'handler',
  'last_update_utc',
] as const;

export type AodbColumn = (typeof AODB_COLUMNS)[number];
export type AodbRow = Readonly<Record<AodbColumn, string>>;

function escapeCell(value: string): string {
  const needsQuotes = ['"', ',', '\n', '\r'].some((ch) => value.includes(ch));
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

export function writeAodbCsv(rows: readonly AodbRow[]): string {
  const lines = [AODB_COLUMNS.join(',')];
  for (const row of rows) {
    const cells = new Map<string, string>(Object.entries(row));
    lines.push(AODB_COLUMNS.map((column) => escapeCell(cells.get(column) ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

// Minimal RFC 4180 parser: quoted cells, escaped quotes, CRLF or LF line endings
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"' && text.charAt(i + 1) === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
      record.push(cell);
      if (record.some((c) => c !== '')) records.push(record);
      record = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || record.length) {
    record.push(cell);
    records.push(record);
  }
  return records;
}

export function parseAodbRows(text: string): AodbRow[] {
  const [header, ...body] = parseCsv(text);
  if (!header) return [];
  const index = new Map(header.map((name, i) => [name.trim(), i]));
  const missing = AODB_COLUMNS.filter((column) => !index.has(column));
  if (missing.length) throw new Error(`AODB CSV is missing columns: ${missing.join(', ')}`);
  return body.map((cells) => {
    const entries = AODB_COLUMNS.map((column) => [column, cells.at(index.get(column) ?? -1) ?? ''] as const);
    return Object.fromEntries(entries) as AodbRow;
  });
}
