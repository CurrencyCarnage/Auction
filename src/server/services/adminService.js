import { hour } from '../storage/seedData.js';
import { audit, normalizeLot, slug } from './auctionService.js';

export class AdminService {
  constructor(store) { this.store = store; }
  auditEvents() { return this.store.readState().audit || []; }
  openHours(hours) {
    const state = this.store.readState();
    state.lots = state.lots.map((lot, i) => ({ ...lot, endAt: Date.now() + (hours * hour) + i * 7 * 60 * 1000 }));
    audit(state, 'admin', 'lots.open_hours', { hours });
    return { state: this.store.writeState(state), message: `All auctions opened for about ${hours} hours` };
  }
  saveLot(incoming) {
    const state = this.store.readState();
    const id = slug(incoming.id || incoming.model);
    const existingIndex = state.lots.findIndex(l => l.id === id);
    const existing = existingIndex >= 0 ? state.lots[existingIndex] : {};
    const lot = normalizeLot({ ...incoming, id }, existing);
    if (existingIndex >= 0) state.lots[existingIndex] = lot;
    else state.lots.unshift(lot);
    audit(state, 'admin', existingIndex >= 0 ? 'lot.updated' : 'lot.added', { lotId: lot.id, model: lot.model });
    return { state: this.store.writeState(state), message: existingIndex >= 0 ? 'Lot updated' : 'Lot added' };
  }
  removeLot(id) {
    const state = this.store.readState();
    const removed = state.lots.find(l => l.id === id);
    state.lots = state.lots.filter(l => l.id !== id);
    audit(state, 'admin', 'lot.removed', { lotId: id, model: removed?.model });
    return { state: this.store.writeState(state), message: 'Lot removed' };
  }
}
