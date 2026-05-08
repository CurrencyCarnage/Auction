import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 4173;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

app.use(express.json());

const users = Array.from({ length: 5 }, (_, i) => ({
  username: `user${i + 1}`,
  password: `pass${i + 1}`,
  name: `Demo Bidder ${i + 1}`,
  limit: 250000 + i * 25000,
}));

const seedLots = [
  { id: 'shacman-x3000', brand: 'SHACMAN', model: 'X3000 Tractor Head', type: 'Heavy Truck', location: 'Tbilisi Yard', year: 2022, hours: '41,000 km', increment: 5000, buyNow: 310000, current: 185000, endsIn: 1000 * 60 * 60 * 2 + 1000 * 60 * 11, accent: '#56B461', shape: 'truck' },
  { id: 'shacman-f3000-dump', brand: 'SHACMAN', model: 'F3000 Dump Truck', type: 'Dump Truck', location: 'Rustavi', year: 2021, hours: '58,000 km', increment: 4000, buyNow: 255000, current: 146000, endsIn: 1000 * 60 * 60 * 1 + 1000 * 60 * 42, accent: '#FBC721', shape: 'dump' },
  { id: 'shacman-l3000-mixer', brand: 'SHACMAN', model: 'L3000 Concrete Mixer', type: 'Mixer Truck', location: 'Kutaisi', year: 2020, hours: '3,900 h', increment: 3000, buyNow: 198000, current: 91000, endsIn: 1000 * 60 * 60 * 3 + 1000 * 60 * 5, accent: '#12A24B', shape: 'mixer' },
  { id: 'case-580st', brand: 'CASE', model: '580ST Backhoe Loader', type: 'Backhoe Loader', location: 'Batumi', year: 2019, hours: '4,250 h', increment: 2500, buyNow: 168000, current: 72000, endsIn: 1000 * 60 * 60 * 2 + 1000 * 60 * 49, accent: '#FBC721', shape: 'backhoe' },
  { id: 'case-cx220c', brand: 'CASE', model: 'CX220C Excavator', type: 'Excavator', location: 'Tbilisi Yard', year: 2020, hours: '5,100 h', increment: 3000, buyNow: 235000, current: 118000, endsIn: 1000 * 60 * 60 * 4 + 1000 * 60 * 18, accent: '#56B461', shape: 'excavator' },
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
  };
}
function ensureState() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, JSON.stringify(freshState(), null, 2));
}
function readState() { ensureState(); return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
function writeState(state) { state.updatedAt = Date.now(); fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); return state; }
function publicUser(u) { return u && { username: u.username, name: u.name, limit: u.limit }; }
function auth(req) { const username = req.headers['x-demo-user']; return users.find(u => u.username === username); }
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

app.get('/api/users', (_, res) => res.json(users.map(publicUser)));
app.get('/api/state', (_, res) => res.json(readState()));
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = users.find(u => u.username === String(username || '').toLowerCase().trim() && u.password === password);
  if (!user) return res.status(401).json({ error: 'Wrong username or password' });
  res.json({ user: publicUser(user) });
});
app.post('/api/reset', (_, res) => res.json(writeState(freshState())));
app.post('/api/bid', (req, res) => {
  const user = auth(req); if (!user) return res.status(401).json({ error: 'Login required' });
  const { lotId, amount } = req.body || {}; const bidAmount = Number(amount);
  const state = readState(); const lot = state.lots.find(l => l.id === lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  if (Date.now() > lot.endAt) return res.status(400).json({ error: 'Auction ended' });
  const min = lot.current + lot.increment;
  if (!Number.isFinite(bidAmount) || bidAmount < min) return res.status(400).json({ error: `Minimum next bid is ${money(min)}` });
  if (bidAmount > user.limit) return res.status(400).json({ error: `${user.username}'s bid ceiling is ${money(user.limit)}` });
  const previous = lot.current;
  lot.current = bidAmount;
  lot.bids.unshift({ user: user.username, name: user.name, amount: bidAmount, at: Date.now(), type: 'manual' });
  const messages = [`Bid placed by ${user.username}: ${money(bidAmount)}`];
  if (lot.endAt - Date.now() < 3 * 60 * 1000) { lot.endAt += 60 * 1000; messages.push('Anti-snipe: auction extended by 1 minute'); }
  if (bidAmount >= previous * 1.5) { lot.suspicious = true; messages.push('Manager alert: suspicious bid jump flagged'); }
  autoProxy(lot, user.username, messages);
  writeState(state); res.json({ state, message: messages.join(' • ') });
});
app.post('/api/proxy', (req, res) => {
  const user = auth(req); if (!user) return res.status(401).json({ error: 'Login required' });
  const { lotId, max } = req.body || {}; const maxAmount = Number(max);
  const state = readState(); const lot = state.lots.find(l => l.id === lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  const min = lot.current + lot.increment;
  if (!Number.isFinite(maxAmount) || maxAmount < min) return res.status(400).json({ error: `Proxy max must be at least ${money(min)}` });
  if (maxAmount > user.limit) return res.status(400).json({ error: `${user.username}'s bid ceiling is ${money(user.limit)}` });
  lot.proxy[user.username] = maxAmount;
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
  const { lotId } = req.body || {}; const state = readState(); const lot = state.lots.find(l => l.id === lotId);
  if (!lot) return res.status(404).json({ error: 'Lot not found' });
  lot.buyRequested = true;
  lot.buyRequests = [...(lot.buyRequests || []), { user: user.username, at: Date.now(), price: lot.buyNow }];
  writeState(state); res.json({ state, message: 'Buy Now request sent to manager. Auction stays live.' });
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (_, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`GT Auction demo running on http://0.0.0.0:${PORT}`));
