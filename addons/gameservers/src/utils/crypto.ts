/**
 * Encryption for game server credentials held at rest.
 *
 * Palworld's REST API is the only way to read its status, and it requires the
 * server's admin password. Storage is plain JSON, so passwords are sealed with
 * AES-256-GCM before they ever reach it.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'arkenbot:gameservers:credentials:v1';

/** Thrown when the deployment has no secret configured to derive a key from. */
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

/** True when this deployment can seal credentials — check before offering to store one. */
export function canStoreCredentials(): boolean {
  return Boolean(process.env.ADDON_ENCRYPTION_KEY ?? process.env.API_SECRET);
}

/** Seals a secret for storage, as `iv.tag.ciphertext` in base64url. */
export function encryptCredential(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), sealed].map((b) => b.toString('base64url')).join('.');
}

/** Opens a credential sealed by `encryptCredential`. Throws if tampered with or key-mismatched. */
export function decryptCredential(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed credential payload');

  const [iv, tag, sealed] = parts.map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed), decipher.final()]).toString('utf8');
}
