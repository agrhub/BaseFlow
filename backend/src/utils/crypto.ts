import crypto from 'crypto';
import { getSecurityConfig, getLegacyEncryptionKeys } from './security';

/**
 * Credential encryption.
 *
 * Current format (v2):  "v2:<iv hex>:<auth tag hex>:<ciphertext hex>"  — AES-256-GCM (authenticated)
 * Legacy format (v1):   "<iv hex>:<ciphertext hex>"                     — AES-256-CBC
 *
 * Legacy values are still readable (with the configured key or the old default
 * keys) and are transparently re-encrypted as v2 the next time they are saved.
 */

const GCM_ALGORITHM = 'aes-256-gcm';
const CBC_ALGORITHM = 'aes-256-cbc';
const V2_PREFIX = 'v2:';

function deriveKey(rawKey: string): Buffer {
  return crypto.createHash('sha256').update(rawKey).digest();
}

function getSecretKey(): Buffer {
  return deriveKey(getSecurityConfig().encryptionKey);
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function isEncrypted(text: string): boolean {
  return typeof text === 'string' && (text.startsWith(V2_PREFIX) || /^[0-9a-f]{32}:[0-9a-f]+$/i.test(text));
}

function decryptLegacyCbc(text: string): string | null {
  const [ivHex, dataHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const keys = [getSecurityConfig().encryptionKey, ...getLegacyEncryptionKeys()];
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv(CBC_ALGORITHM, deriveKey(key), iv);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    } catch {
      // try next key
    }
  }
  return null;
}

/**
 * Decrypt a stored value. Non-encrypted (legacy plain text) values are returned
 * unchanged. Values that cannot be decrypted return an empty string — the
 * ciphertext is never leaked back to callers.
 */
export function decrypt(text: string): string {
  if (typeof text !== 'string' || text.length === 0) return '';

  if (text.startsWith(V2_PREFIX)) {
    try {
      const [ivHex, tagHex, dataHex] = text.slice(V2_PREFIX.length).split(':');
      const decipher = crypto.createDecipheriv(GCM_ALGORITHM, getSecretKey(), Buffer.from(ivHex, 'hex'));
      decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
      return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    } catch {
      console.error('[Crypto] Failed to decrypt value — was ENCRYPTION_KEY changed?');
      return '';
    }
  }

  if (/^[0-9a-f]{32}:[0-9a-f]+$/i.test(text)) {
    const legacy = decryptLegacyCbc(text);
    if (legacy !== null) return legacy;
    console.error('[Crypto] Failed to decrypt legacy value — was ENCRYPTION_KEY changed?');
    return '';
  }

  // Plain text (pre-encryption data)
  return text;
}
