import crypto from 'crypto';

const SCRYPT_PREFIX = 'scrypt';
const KEY_LENGTH = 64;

function timingSafeStringEqual(a, b) {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('base64url');
  return `${SCRYPT_PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const stored = String(storedHash);

  // Backward compatibility for early demo seed rows. These are not secure and
  // should disappear naturally as staging/prod databases are reseeded or migrated.
  if (stored.startsWith('demo-only-password-')) return timingSafeStringEqual(stored, `demo-only-password-${password}`);
  if (stored === 'demo-only-admin-password-admin') return timingSafeStringEqual(String(password), 'admin');

  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== SCRYPT_PREFIX || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('base64url');
  return timingSafeStringEqual(actual, expected);
}
