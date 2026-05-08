import { users } from '../storage/seedData.js';
import { verifyToken } from './session.js';

export function publicUser(u) { return u && { username: u.username, name: u.name, limit: u.limit }; }
export function authBidder(req, config) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.headers['x-user-token'] || bearer;
  const payload = verifyToken(token, config?.sessionSecret);
  if (payload?.type === 'bidder' && payload?.username) return users.find(u => u.username === payload.username);
  const username = req.headers['x-demo-user'];
  return users.find(u => u.username === username);
}
export function authAdmin(req, config) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.headers['x-admin-token'] || bearer;
  const payload = verifyToken(token, config?.sessionSecret);
  if (payload?.type === 'admin' && payload?.username === config.adminUsername) return true;
  return Boolean(token && token === config.adminSessionToken);
}
