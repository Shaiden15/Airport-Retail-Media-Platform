import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

// Streams a JSON Lines feed file one record at a time, so large days never load fully into memory
export async function* readJsonLines(file: string): AsyncGenerator<unknown> {
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) yield JSON.parse(trimmed) as unknown;
  }
}
