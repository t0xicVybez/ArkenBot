/**
 * AES-256-GCM sealing for RCON passwords held at rest. Storage is plain JSON,
 * so passwords are encrypted before they ever reach it. The key is derived from
 * ADDON_ENCRYPTION_KEY (falling back to API_SECRET).
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'arkenbot:gameadmin:credentials:v1';

export class MissingKeyError extends Error {
  constructor() {
    super('Credential storage is unavailable: set ADDON_ENCRYPTION_KEY or API_SECRET.');
    this.name = 'MissingKeyError';
  }
}

function deriveKey(): Buffer {
  const secret = process.env.ADDON_ENCRYPTION_KEY ?? process.env.API_SECRET;
  if (!secret) throw new MissingKeyError();
  return scryptSync(secret, SALT, 32);
}

export function canStoreCredentials(): boolean {
  return Boolean(process.env.ADDON_ENCRYPTION_KEY ?? process.env.API_SECRET);
}

export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), sealed].map((b) => b.toString('base64url')).join('.');
}

export function decryptCredential(payload: string): string {
  const [iv, tag, sealed] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed), decipher.final()]).toString('utf8');
}
