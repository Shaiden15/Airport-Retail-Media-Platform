import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';

const payloadSchema = z.object({
  c: z.string().min(1).max(80),
  s: z.string().min(1).max(40),
  f: z.string().max(80).nullable(),
  e: z.number().int().positive(),
});
export type OfferPayload = z.infer<typeof payloadSchema>;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// The secret survives restarts so QR codes already on screens keep working
export function loadClaimSecret(db: Database, fromEnv: string | undefined): string {
  if (fromEnv) return fromEnv;
  const row = db.prepare("SELECT value FROM engine_settings WHERE key = 'claim_secret'").get();
  if (row) return String(JSON.parse(String(row.value)));
  const secret = randomBytes(32).toString('base64url');
  db.prepare("INSERT INTO engine_settings (key, value, updated_at) VALUES ('claim_secret', ?, ?)").run(JSON.stringify(secret), new Date().toISOString());
  return secret;
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url').slice(0, 24);
}

// Signed so nobody can mint a claim for a campaign that never played on that screen
export function createOfferToken(secret: string, payload: OfferPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(secret, body)}`;
}

export function readOfferToken(secret: string, token: string): OfferPayload | null {
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra !== undefined || body.length > 400) return null;
  const expected = Buffer.from(sign(secret, body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function newPromoCode(prefix = ''): string {
  let code = prefix;
  while (code.length < 8) code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  return code;
}
