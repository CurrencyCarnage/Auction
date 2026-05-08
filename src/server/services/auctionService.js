import { users, hour } from '../storage/seedData.js';
import { publicUser } from '../auth/demoAuth.js';

export function audit(state, actor, action, detail = {}) {
  state.audit = [{ at: Date.now(), actor, action, detail }, ...(state.audit || [])].slice(0, 500);
}
export function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `lot-${Date.now()}`; }
export function money(n) { return '₾' + Math.round(n).toLocaleString('en-US'); }

export function normalizeLot(input, existing = {}) {
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

export class AuctionService {
  constructor(store) { this.store = store; }
  async publicState() {
    const state = await this.store.readStateAsync();
    return { ...state, audit: undefined };
  }
  users() { return users.map(publicUser); }
  login(username, password) {
    const user = users.find(u => u.username === String(username || '').toLowerCase().trim() && u.password === password);
    if (!user) return null;
    return publicUser(user);
  }
  async reset() { return this.store.resetStateAsync(); }
  async placeBid(user, { lotId, amount }) {
    const bidAmount = Number(amount);
    const state = await this.store.readStateAsync(); const lot = state.lots.find(l => l.id === lotId);
    if (!lot) throw Object.assign(new Error('Lot not found'), { status: 404 });
    if (Date.now() > lot.endAt) throw Object.assign(new Error('Auction ended'), { status: 400 });
    const min = lot.current + lot.increment;
    if (!Number.isFinite(bidAmount) || bidAmount < min) throw Object.assign(new Error(`Minimum next bid is ${money(min)}`), { status: 400 });
    if (bidAmount > user.limit) throw Object.assign(new Error(`${user.username}'s bid ceiling is ${money(user.limit)}`), { status: 400 });
    const previous = lot.current;
    lot.current = bidAmount;
    lot.bids.unshift({ user: user.username, name: user.name, amount: bidAmount, at: Date.now(), type: 'manual' });
    audit(state, user.username, 'bid.placed', { lotId: lot.id, amount: bidAmount });
    const messages = [`Bid placed by ${user.username}: ${money(bidAmount)}`];
    if (lot.endAt - Date.now() < 3 * 60 * 1000) { lot.endAt += 60 * 1000; messages.push('Anti-snipe: auction extended by 1 minute'); }
    if (bidAmount >= previous * 1.5) { lot.suspicious = true; messages.push('Manager alert: suspicious bid jump flagged'); }
    autoProxy(lot, user.username, messages);
    await this.store.writeStateAsync(state); return { state, message: messages.join(' • ') };
  }
  async saveProxy(user, { lotId, max }) {
    const maxAmount = Number(max);
    const state = await this.store.readStateAsync(); const lot = state.lots.find(l => l.id === lotId);
    if (!lot) throw Object.assign(new Error('Lot not found'), { status: 404 });
    const min = lot.current + lot.increment;
    if (!Number.isFinite(maxAmount) || maxAmount < min) throw Object.assign(new Error(`Proxy max must be at least ${money(min)}`), { status: 400 });
    if (maxAmount > user.limit) throw Object.assign(new Error(`${user.username}'s bid ceiling is ${money(user.limit)}`), { status: 400 });
    lot.proxy[user.username] = maxAmount;
    audit(state, user.username, 'proxy.saved', { lotId: lot.id, max: maxAmount });
    const messages = [`${user.username}'s proxy saved up to ${money(maxAmount)}`];
    if (lot.bids[0]?.user !== user.username && lot.current + lot.increment <= maxAmount) {
      lot.current += lot.increment;
      lot.bids.unshift({ user: user.username, name: user.name, amount: lot.current, at: Date.now(), type: 'proxy_auto' });
      messages.push(`Proxy placed current bid at ${money(lot.current)}`);
    }
    await this.store.writeStateAsync(state); return { state, message: messages.join(' • ') };
  }
  async requestBuyNow(user, { lotId }) {
    const state = await this.store.readStateAsync(); const lot = state.lots.find(l => l.id === lotId);
    if (!lot) throw Object.assign(new Error('Lot not found'), { status: 404 });
    lot.buyRequested = true;
    lot.buyRequests = [...(lot.buyRequests || []), { user: user.username, at: Date.now(), price: lot.buyNow }];
    audit(state, user.username, 'buy_now.requested', { lotId: lot.id, price: lot.buyNow });
    await this.store.writeStateAsync(state); return { state, message: 'Buy Now request sent to manager. Auction stays live.' };
  }
}
