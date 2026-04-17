import crypto from 'crypto';

const IV_LENGTH = 12;

function normalizeMasterKey(rawKey: string): Buffer {
  const trimmed = rawKey.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // ignore and fallback
  }

  const utf8Buffer = Buffer.from(trimmed, 'utf8');
  if (utf8Buffer.length === 32) return utf8Buffer;

  return crypto.createHash('sha256').update(trimmed).digest();
}

function getMasterKey(): Buffer {
  const raw = process.env.INTEGRATION_SECRETS_MASTER_KEY;
  if (!raw || !raw.trim()) {
    throw new Error('INTEGRATION_SECRETS_MASTER_KEY nao configurada.');
  }

  const key = normalizeMasterKey(raw);
  if (key.length !== 32) {
    throw new Error('INTEGRATION_SECRETS_MASTER_KEY invalida (chave efetiva deve ter 32 bytes).');
  }

  return key;
}

export function encryptSecret(plainText: string): { ciphertext: string; iv: string; tag: string } {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64')
  };
}

export function decryptSecret(ciphertext: string, iv: string, tag: string): string {
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

