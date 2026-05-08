import { users } from '../storage/seedData.js';

export function publicUser(u) { return u && { username: u.username, name: u.name, limit: u.limit }; }
export function authBidder(req) {
  const username = req.headers['x-demo-user'];
  return users.find(u => u.username === username);
}
export function authAdmin(req, config) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const token = req.headers['x-admin-token'] || bearer;
  return Boolean(token && token === config.adminSessionToken);
}
