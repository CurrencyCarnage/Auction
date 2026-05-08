import { users } from '../storage/seedData.js';
import { verifyToken } from './session.js';

export function publicUser(u) { return u && { username: u.username, name: u.name, limit: u.limit }; }
export function authBidder(req, config) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.headers['x-user-token'] || bearer;
  const payload = verifyToken(token, config?.sessionSecret);
  if (payload?.type === 'bidder' && payload?.username) return {
    username: payload.username,
    name: payload.name || payload.username,
    limit: Number(payload.limit || 0),
    status: payload.status || 'approved',
  };
  if (!config?.demoMode) return null;
  const username = req.headers['x-demo-user'];
  return users.find(u => u.username === username);
}
export function authAdmin(req, config) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.headers['x-admin-token'] || bearer;
  const payload = verifyToken(token, config?.sessionSecret);
  if (payload?.type === 'admin' && payload?.username && payload?.role) return payload;
  return Boolean(token && token === config.adminSessionToken);
}
