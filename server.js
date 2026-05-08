import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4173;
const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (DEMO_MODE ? 'admin' : '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (DEMO_MODE ? 'admin' : '');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

if (!DEMO_MODE && (!ADMIN_USERNAME || !ADMIN_PASSWORD)) {
  throw new Error('Production mode requires ADMIN_USERNAME and ADMIN_PASSWORD environment variables.');
}

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '64kb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: DEMO_MODE ? 240 : 90, standardHeaders: true, legacyHeaders: false }));

const users = Array.from({ length: 5 }, (_, i) => ({
  username: `user${i + 1}`,
  password: `pass${i + 1}`,
  name: `Demo Bidder ${i + 1}`,
  limit: 250000 + i * 25000,
}));

const hour = 1000 * 60 * 60;
const seedLots = [
  { id: 'shacman-x3000', brand: 'SHACMAN', model: 'X3000 Tractor Head', type: 'Heavy Truck', location: 'Tbilisi Yard', year: 2022, hours: '41,000 km', increment: 5000, buyNow: 310000, current: 185000, endsIn: 9 * hour + 11 * 60 * 1000, accent: '#56B461', shape: 'truck' },
  { id: 'shacman-f3000-dump', brand: 'SHACMAN', model: 'F3000 Dump Truck', type: 'Dump Truck', location: 'Rustavi', year: 2021, hours: '58,000 km', increment: 4000, buyNow: 255000, current: 146000, endsIn: 7 * hour + 42 * 60 * 1000, accent: '#FBC721', shape: 'dump' },
  { id: 'shacman-l3000-mixer', brand: 'SHACMAN', model: 'L3000 Concrete Mixer', type: 'Mixer Truck', location: 'Kutaisi', year: 2020, hours: '3,900 h', increment: 3000, buyNow: 198000, current: 91000, endsIn: 11 * hour + 5 * 60 * 1000, accent: '#12A24B', shape: 'mixer' },
  { id: 'case-580st', brand: 'CASE', model: '580ST Backhoe Loader', type: 'Backhoe Loader', location: 'Batumi', year: 2019, hours: '4,250 h', increment: 2500, buyNow: 168000, current: 72000, endsIn: 8 * hour + 49 * 60 * 1000, accent: '#FBC721', shape: 'backhoe' },
  { id: 'case-cx220c', brand: 'CASE', model: 'CX220C Excavator', type: 'Excavator', location: 'Tbilisi Yard', year: 2020, hours: '5,100 h', increment: 3000, buyNow: 235000, current: 118000, endsIn: 12 * hour + 18 * 60 * 1000, accent: '#56B461', shape: 'excavator' },
];

function freshState() {
  const start = Date.now();
  return {
    createdAt: start,
    updatedAt: start,
    lots: seedLots.map((l, i) => ({
      ...l,
      endAt: start + l.endsIn,
      buyRequested: i === 1,
      buyRequests: [],
      bids: [{ user: 'opening', name: 'Opening bid', amount: l.current, at: start - 1000 * 60 * (15 + i * 4), type: 'opening' }],
      proxy: {},
    })),
    audit: [{ at: start, actor: 'system', action: 'state.seeded', detail: { lots: seedLots.length } }],
  };
}
function stateNeedsRefresh(state) {
  if (!state?.lots?.length) return true;
  const now = Date.now();
  const allClosedOrNearlyClosed = state.lots.every(l => Number(l.endAt || 0) < now + 10 * 60 * 1000);
  const olderThanHalfDay = Number(state.createdAt || 0) < now - 12 * hour;
  return allClosedOrNearlyClosed || olderThanHalfDay;
}
function ensureState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(freshState(), null, 2));
}
function readState() {
  ensureState();
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (stateNeedsRefresh(state)) return writeState(freshState());
  return state;
}
function writeState(state) { state.updatedAt = Date.now(); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); return state; }
function audit(state, actor, action, detail = {}) {
  state.audit = [{ at: Date.now(), actor, action, detail }, ...(state.audit || [])].slice(0, 500);
}
function publicUser(u) { return u && { username: u.username, name: u.name, limit: u.limit }; }
function auth(req) { const username = req.headers['x-demo-user']; return users.find(u => u.username === username); }
function adminAuth(req) { return req.headers['x-admin-user'] === ADMIN_USERNAME && req.headers['x-admin-pass'] === ADMIN_PASSWORD; }
function requireAdmin(req, res) { if (!adminAuth(req)) { res.status(401).json({ error: 'Admin login required' }); return false; } return true; }
function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `lot-${Date.now()}`; }
function normalizeLot(input, existing = {}) {
  const now = Date.now();
  const endAt = input.endAt ? new Date(input.endAt).getTime() : Number(input.endAtMs || existing.endAt || now + 8 * hour);
  return {
    ...existing,
    id: slug(input.id || existing.id || input.model),
    brand: String(input.brand || existing.brand || 'SHACMAN').toUpperCase(),
    model: String(input.model || existing.model || 'New Auction Lot'),
    type: String(input.type || existing.type || 'Heavy Truck'),
    location: String(input.location || existing.location || 'Tbilisi Yard'),
    year: Number(input.year || existing.year || new Date().getFullYear()),
    hours: String(input.hours || existing.hours || '0 h'),
    increment: Number(input.increment || existing.increment || 1000),
    buyNow: Number(input.buyNow || existing.buyNow || 0),
    current: Number(input.current || existing.current || 0),
    endAt: Number.isFinite(endAt) ? endAt : now + 8 * hour,
    imageKey: input.imageKey || existing.imageKey || existing.id || 'shacman-x3000',
    accent: existing.accent || '#56B461',
    shape: existing.shape || 'truck',
    buyRequested: Boolean(input.buyRequested ?? existing.buyRequested ?? false),
    buyRequests: existing.buyRequests || [],
    bids: existing.bids?.length ? existing.bids : [{ user: 'opening', name: 'Opening bid', amount: Number(input.current || existing.current || 0), at: now, type: 'opening' }],
    proxy: existing.proxy || {},
  };
}
function parseBody(schema, req, res) {
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid request' });
    return null;
  }
  return parsed.data;
}
const loginSchema = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(200) });
const hoursSchema = z.object({ hours: z.coerce.number().int().min(1).max(72).default(8) });
const lotSchema = z.object({
  id: z.string().trim().max(80).optional().or(z.literal('')),
  brand: z.string().trim().min(1).max(80).default('SHACMAN'),
  model: z.string().trim().min(1).max(140),
  type: z.string().trim().min(1).max(100).default('Heavy Truck'),
  location: z.string().trim().min(1).max(120).default('Tbilisi Yard'),
  year: z.coerce.number().int().min(1980).max(2100).default(new Date().getFullYear()),
  hours: z.string().trim().min(1).max(80).default('0 h'),
  increment: z.coerce.number().positive().max(1000000).default(1000),
  buyNow: z.coerce.number().min(0).max(100000000).default(0),
  current: z.coerce.number().min(0).max(100000000).default(0),
  endAt: z.string().optional(),
  endAtMs: z.coerce.number().optional(),
  imageKey: z.string().trim().max(120).optional(),
  buyRequested: z.boolean().optional(),
});
const bidSchema = z.object({ lotId: z.string().trim().min(1).max(120), amount: z.coerce.number().positive().max(100000000) });
const proxySchema = z.object({ lotId: z.string().trim().min(1).max(120), max: z.coerce.number().positive().max(100000000) });
const lotIdSchema = z.object({ lotId: z.string().trim().min(1).max(120) });
function money(n) { return '₾' + Math.round(n).toLocaleString('en-US'); }
function autoProxy(lot, skipUser, messages) {
  const candidate = Object.entries(lot.proxy || {})
    .filter(([u, max]) => u !== skipUser && max >= lot.current + lot.increment)
    .sort((a, b) => b[1] - a[1])[0];
  if (!candidate) return;
  const [username, max] = candidate;
  const person = users.find(u => u.username === username);
  const bid = Math.min(max, lot.current + lot.increment);
  lot.current = bid;
  lot.bids.unshift({ user: username, name: person?.name || username, amount: bid, at: Date.now() + 1, type: 'proxy_auto' });
  messages.push(`Outbid by ${username}'s proxy at ${money(bid)}`);
}

app.get('/healthz', (_, res) => res.json({ ok: true, mode: DEMO_MODE ? 'demo' : 'production', time: new Date().toISOString() }));
app.get('/api/users', (_, res) => res.json(users.map(publicUser)));
app.get('/api/state', (_, res) => {
  const state = readState();
  const publicState = { ...state, audit: undefined };
  res.json(publicState);
});
app.get('/api/admin/audit', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ audit: readState().audit || [] });
});
app.post('/api/admin/login', (req, res) => {
  const body = parseBody(loginSchema, req, res); if (!body) return;
  const { username, password } = body;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Wrong admin username or password' });
  res.json({ admin: { username: ADMIN_USERNAME } });
});
app.post('/api/admin/open-hours', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const body = parseBody(hoursSchema, req, res); if (!body) return;
  const { hours } = body;
  const state = readState();
  state.lots = state.lots.map((lot, i) => ({ ...lot, endAt: Date.now() + (hours * hour) + i * 7 * 60 * 1000 }));
  audit(state, 'admin', 'lots.open_hours', { hours });
  res.json({ state: writeState(state), message: `All auctions opened for about ${hours} hours` });
});
app.post('/api/admin/lot', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const state = readState();
  const incoming = parseBody(lotSchema, req, res); if (!incoming) return;
  const id = slug(incoming.id || incoming.model);
  const existingIndex = state.lots.findIndex(l => l.id === id);
  const existing = existingIndex >= 0 ? state.lots[existingIndex] : {};
  const lot = normalizeLot({ ...incoming, id }, existing);
  if (existingIndex >= 0) state.lots[existingIndex] = lot;
  else state.lots.unshift(lot);
  audit(state, 'admin', existingIndex >= 0 ? 'lot.updated' : 'lot.added', { lotId: lot.id, model: lot.model });
  res.json({ state: writeState(state), message: existingIndex >= 0 ? 'Lot updated' : 'Lot added' });
});
app.delete('/api/admin/lot/:id', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const state = readState();
  const removed = state.lots.find(l => l.id === req.params.id);
  state.lots = state.lots.filter(l => l.id !== req.params.id);
  audit(state, 'admin', 'lot.removed', { lotId: req.params.id, model: removed?.model });
  res.json({ state: writeState(state), message: 'Lot removed' });
});
app.post('/api/login', (req, res) => {
  const body = parseBody(loginSchema, req, res); if (!body) return;
  const { username, password } = body;
  const user = users.find(u => u.username === String(username || '').toLowerCase().trim() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password' });
  res.json({ user: publicUser(user) });
});
app.post('/api/reset', (_, res) => res.json(writeState(freshState())));
app.post('/api/bid', (req, res) => {
  const user = auth(req); if (!user) return res.status(401).json({ error: 'Login required' });
  const body = parseBody(bidSchema, req, res); if (!body) return;
  const { lotId, amount } = body; const bidAmount = Number(amount);
  const state = readState(); const lot = state.lots.find(l => l.id === lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  if (Date.now() > lot.endAt) return res.status(400).json({ error: 'Auction ended' });
  const min = lot.current + lot.increment;
  if (!Number.isFinite(bidAmount) || bidAmount < min) return res.status(400).json({ error: `Minimum next bid is ${money(min)}` });
  if (bidAmount > user.limit) return res.status(400).json({ error: `${user.username}'s bid ceiling is ${money(user.limit)}` });
  const previous = lot.current;
  lot.current = bidAmount;
  lot.bids.unshift({ user: user.username, name: user.name, amount: bidAmount, at: Date.now(), type: 'manual' });
  audit(state, user.username, 'bid.placed', { lotId: lot.id, amount: bidAmount });
  const messages = [`Bid placed by ${user.username}: ${money(bidAmount)}`];
  if (lot.endAt - Date.now() < 3 * 60 * 1000) { lot.endAt += 60 * 1000; messages.push('Anti-snipe: auction extended by 1 minute'); }
  if (bidAmount >= previous * 1.5) { lot.suspicious = true; messages.push('Manager alert: suspicious bid jump flagged'); }
  autoProxy(lot, user.username, messages);
  writeState(state); res.json({ state, message: messages.join(' • ') });
});
app.post('/api/proxy', (req, res) => {
  const user = auth(req); if (!user) return res.status(401).json({ error: 'Login required' });
  const body = parseBody(proxySchema, req, res); if (!body) return;
  const { lotId, max } = body; const maxAmount = Number(max);
  const state = readState(); const lot = state.lots.find(l => l.id === lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  const min = lot.current + lot.increment;
  if (!Number.isFinite(maxAmount) || maxAmount < min) return res.status(400).json({ error: `Proxy max must be at least ${money(min)}` });
  if (maxAmount > user.limit) return res.status(400).json({ error: `${user.username}'s bid ceiling is ${money(user.limit)}` });
  lot.proxy[user.username] = maxAmount;
  audit(state, user.username, 'proxy.saved', { lotId: lot.id, max: maxAmount });
  const messages = [`${user.username}'s proxy saved up to ${money(maxAmount)}`];
  if (lot.bids[0]?.user !== user.username && lot.current + lot.increment <= maxAmount) {
    lot.current += lot.increment;
    lot.bids.unshift({ user: user.username, name: user.name, amount: lot.current, at: Date.now(), type: 'proxy_auto' });
    messages.push(`Proxy placed current bid at ${money(lot.current)}`);
  }
  writeState(state); res.json({ state, message: messages.join(' • ') });
});
app.post('/api/buy-now', (req, res) => {
  const user = auth(req); if (!user) return res.status(401).json({ error: 'Login required' });
  const body = parseBody(lotIdSchema, req, res); if (!body) return;
  const { lotId } = body; const state = readState(); const lot = state.lots.find(l => l.id === lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  lot.buyRequested = true;
  lot.buyRequests = [...(lot.buyRequests || []), { user: user.username, at: Date.now(), price: lot.buyNow }];
  audit(state, user.username, 'buy_now.requested', { lotId: lot.id, price: lot.buyNow });
  writeState(state); res.json({ state, message: 'Buy Now request sent to manager. Auction stays live.' });
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`GT Auction demo running on http://0.0.0.0:${PORT}`));
