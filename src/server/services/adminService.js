import { hour } from '../storage/seedData.js';
import { audit, normalizeLot, slug } from './auctionService.js';

export class AdminService {
  constructor(store) { this.store = store; }
  async login(username, password, config) {
    if (this.store.findAdminByLogin) return this.store.findAdminByLogin(username, password);
    if (username === config.adminUsername && password === config.adminPassword) return { username: config.adminUsername, name: 'Admin', role: 'super_admin', status: 'active' };
    return null;
  }
  async auditEvents() { return (await this.store.readStateAsync()).audit || []; }
  async openHours(hours) {
    if (this.store.adminOpenLotsTx) return this.store.adminOpenLotsTx(hours);
    const state = await this.store.readStateAsync();
    state.lots = state.lots.map((lot, i) => ({ ...lot, endAt: Date.now() + (hours * hour) + i * 7 * 60 * 1000 }));
    audit(state, 'admin', 'lots.open_hours', { hours });
    return { state: await this.store.writeStateAsync(state), message: `All auctions opened for about ${hours} hours` };
  }
  async saveLot(incoming) {
    if (this.store.adminSaveLotTx) return this.store.adminSaveLotTx(incoming);
    const state = await this.store.readStateAsync();
    const id = slug(incoming.id || incoming.model);
    const existingIndex = state.lots.findIndex(l => l.id === id);
    const existing = existingIndex >= 0 ? state.lots[existingIndex] : {};
    const lot = normalizeLot({ ...incoming, id }, existing);
    if (existingIndex >= 0) state.lots[existingIndex] = lot;
    else state.lots.unshift(lot);
    audit(state, 'admin', existingIndex >= 0 ? 'lot.updated' : 'lot.added', { lotId: lot.id, model: lot.model });
    return { state: await this.store.writeStateAsync(state), message: existingIndex >= 0 ? 'Lot updated' : 'Lot added' };
  }
  async removeLot(id) {
    if (this.store.adminRemoveLotTx) return this.store.adminRemoveLotTx(id);
    const state = await this.store.readStateAsync();
    const removed = state.lots.find(l => l.id === id);
    state.lots = state.lots.filter(l => l.id !== id);
    audit(state, 'admin', 'lot.removed', { lotId: id, model: removed?.model });
    return { state: await this.store.writeStateAsync(state), message: 'Lot removed' };
  }
}
