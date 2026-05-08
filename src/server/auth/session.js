import crypto from 'crypto';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}
function unb64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}
function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createToken(payload, secret, ttlMs = 24 * 60 * 60 * 1000) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  return `${body}.${signPayload(body, secret)}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret || !String(token).includes('.')) return null;
  const [body, sig] = String(token).split('.');
  const expected = signPayload(body, secret);
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(unb64url(body));
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}
