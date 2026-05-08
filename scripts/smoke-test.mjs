const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
async function request(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} failed ${res.status}: ${data.error || text}`);
  return data;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const health = await request('/healthz');
assert(health.ok, 'healthz should be ok');

const state = await request('/api/state');
assert(Array.isArray(state.lots) && state.lots.length > 0, 'state should expose lots');
assert(!('audit' in state), 'public state must not expose audit');
const lot = state.lots[0];

const adminLogin = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) });
assert(adminLogin.admin?.username === 'admin', 'admin login should work in demo mode');
const adminHeaders = { 'x-admin-user': 'admin', 'x-admin-pass': 'admin' };
await request('/api/admin/open-hours', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ hours: 5 }) });

const login = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'user1', password: 'pass1' }) });
assert(login.user?.username === 'user1', 'bidder login should work');
const userHeaders = { 'x-demo-user': 'user1' };
await request('/api/bid', { method: 'POST', headers: userHeaders, body: JSON.stringify({ lotId: lot.id, amount: lot.current + lot.increment }) });
await request('/api/proxy', { method: 'POST', headers: userHeaders, body: JSON.stringify({ lotId: lot.id, max: lot.current + lot.increment * 3 }) });
await request('/api/buy-now', { method: 'POST', headers: userHeaders, body: JSON.stringify({ lotId: lot.id }) });

const audit = await request('/api/admin/audit', { headers: adminHeaders });
assert(Array.isArray(audit.audit) && audit.audit.length >= 3, 'audit should capture actions');

let badRejected = false;
try {
  await request('/api/bid', { method: 'POST', headers: userHeaders, body: JSON.stringify({ lotId: lot.id, amount: -5 }) });
} catch {
  badRejected = true;
}
assert(badRejected, 'invalid bid should be rejected');

console.log('Smoke test passed');
