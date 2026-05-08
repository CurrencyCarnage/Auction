const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:4173';
async function request(path, options = {}, expected = 200) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (res.status !== expected) throw new Error(`${options.method || 'GET'} ${path} expected ${expected}, got ${res.status}: ${data.error || text}`);
  return data;
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const adminLogin = await request('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin' }) });
assert(adminLogin.admin.role === 'super_admin', 'admin login should include a role');
const adminHeaders = { 'x-admin-token': adminLogin.admin.token };
await request('/api/reset', { method: 'POST' });
let state = await request('/api/state');
const lot = state.lots[0];
const bidderLogin = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'user1', password: 'pass1' }) });
assert(bidderLogin.user.status === 'approved', 'bidder login should expose approval status');
const bidderHeaders = { Authorization: `Bearer ${bidderLogin.user.token}` };

await request('/api/bid', { method: 'POST', headers: bidderHeaders, body: JSON.stringify({ lotId: lot.id, amount: lot.current }) }, 400);
await request('/api/bid', { method: 'POST', body: JSON.stringify({ lotId: lot.id, amount: lot.current + lot.increment }) }, 401);
await request('/api/bid', { method: 'POST', headers: bidderHeaders, body: JSON.stringify({ lotId: lot.id, amount: 999999999 }) }, 400);

const bid1 = await request('/api/bid', { method: 'POST', headers: bidderHeaders, body: JSON.stringify({ lotId: lot.id, amount: lot.current + lot.increment }) });
assert(bid1.state.lots.find(l => l.id === lot.id).current === lot.current + lot.increment, 'valid bid should update current amount');

const proxyLogin = await request('/api/login', { method: 'POST', body: JSON.stringify({ username: 'user2', password: 'pass2' }) });
const proxySaved = await request('/api/proxy', { method: 'POST', headers: { Authorization: `Bearer ${proxyLogin.user.token}` }, body: JSON.stringify({ lotId: lot.id, max: lot.current + lot.increment * 4 }) });
const afterProxySave = proxySaved.state.lots.find(l => l.id === lot.id);
const bid2Amount = afterProxySave.current + afterProxySave.increment;
const bid2 = await request('/api/bid', { method: 'POST', headers: bidderHeaders, body: JSON.stringify({ lotId: lot.id, amount: bid2Amount }) });
const afterProxy = bid2.state.lots.find(l => l.id === lot.id);
assert(afterProxy.bids[0].type === 'proxy_auto' || afterProxy.current > bid2Amount, 'proxy should be able to auto-outbid');

await request('/api/admin/open-hours', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ hours: 1 }) });
const added = await request('/api/admin/lot', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ id: 'behavior-test-lot', brand: 'CASE', model: 'Behavior Test Lot', type: 'Loader', location: 'Tbilisi', year: 2024, hours: '1 h', current: 1000, increment: 500, buyNow: 5000, imageKey: 'case-580st' }) });
assert(added.state.lots.some(l => l.id === 'behavior-test-lot'), 'admin should add lot');
const statusChanged = await request('/api/admin/lot/behavior-test-lot/status', { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ status: 'pending_approval' }) });
assert(statusChanged.state.lots.find(l => l.id === 'behavior-test-lot').status === 'pending_approval', 'admin should move lot into review status');
await request('/api/bid', { method: 'POST', headers: bidderHeaders, body: JSON.stringify({ lotId: 'behavior-test-lot', amount: 1500 }) }, 400);
const removed = await request('/api/admin/lot/behavior-test-lot', { method: 'DELETE', headers: adminHeaders });
assert(!removed.state.lots.some(l => l.id === 'behavior-test-lot' && l.status !== 'cancelled'), 'admin should remove or cancel lot');

const audit = await request('/api/admin/audit', { headers: adminHeaders });
assert(audit.audit.some(e => e.action === 'bid.placed'), 'audit should include bid.placed');
assert(audit.audit.some(e => e.action === 'lot.added' || e.action === 'lot.updated'), 'audit should include lot add/update');
assert(audit.audit.some(e => e.action === 'lot.status_changed'), 'audit should include status changes');

console.log('Behavior test passed');
