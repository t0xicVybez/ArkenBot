
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'arkenbot:api:secrets:v1';

export class MissingKeyError extends Error {
  constructor() {
    super('Secret storage is unavailable: set SESSION_ENCRYPTION_KEY or API_SECRET.');
    this.name = 'MissingKeyError';
  }
}

function deriveKey(): Buffer {
  const secret = process.env.SESSION_ENCRYPTION_KEY ?? process.env.API_SECRET;
  if (!secret) throw new MissingKeyError();
  return scryptSync(secret, SALT, 32);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), sealed].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed secret payload');

  const [iv, tag, sealed] = parts.map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed), decipher.final()]).toString('utf8');
}

export function decryptSecretLenient(stored: string): string {
  if (stored.split('.').length !== 3) return stored;
  try {
    return decryptSecret(stored);
  } catch {
    return stored;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
