/**
 * Symmetric encryption for secrets held at rest in the API database.
 *
 * Discord OAuth access/refresh tokens are stored on the `PortalUser` row so the
 * dashboard can act on the user's behalf (e.g. reading their guild list). They
 * are sealed with AES-256-GCM before persistence so a database leak does not
 * hand out live Discord tokens.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'arkenbot:api:secrets:v1';

/** Thrown when the deployment has no secret configured to derive a key from. */
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

/** Seals a secret for storage, as `iv.tag.ciphertext` in base64url. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), sealed].map((b) => b.toString('base64url')).join('.');
}

/** Opens a secret sealed by `encryptSecret`. Throws if tampered with or key-mismatched. */
export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed secret payload');

  const [iv, tag, sealed] = parts.map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed), decipher.final()]).toString('utf8');
}

/**
 * Opens a stored Discord token, tolerating legacy plaintext rows written before
 * encryption was introduced. Returns the value as-is when it is not in the
 * sealed `iv.tag.ct` shape or cannot be decrypted, so existing sessions keep
 * working until the user next logs in and the value is re-sealed.
 */
export function decryptSecretLenient(stored: string): string {
  if (stored.split('.').length !== 3) return stored;
  try {
    return decryptSecret(stored);
  } catch {
    return stored;
  }
}

/** SHA-256 hex digest — used to store opaque session ids without keeping the raw value. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
