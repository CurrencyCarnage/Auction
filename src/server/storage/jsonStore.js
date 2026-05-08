import fs from 'fs';
import { freshState, hour } from './seedData.js';

function stateNeedsRefresh(state) {
  if (!state?.lots?.length) return true;
  const now = Date.now();
  const allClosedOrNearlyClosed = state.lots.every(l => Number(l.endAt || 0) < now + 10 * 60 * 1000);
  const olderThanHalfDay = Number(state.createdAt || 0) < now - 12 * hour;
  return allClosedOrNearlyClosed || olderThanHalfDay;
}

export class JsonAuctionStore {
  constructor(config) { this.config = config; }
  ensureState() {
    fs.mkdirSync(this.config.dataDir, { recursive: true });
    if (!fs.existsSync(this.config.stateFile)) this.writeState(freshState());
  }
  readState() {
    this.ensureState();
    const state = JSON.parse(fs.readFileSync(this.config.stateFile, 'utf8'));
    if (stateNeedsRefresh(state)) return this.writeState(freshState());
    return state;
  }
  writeState(state) {
    state.updatedAt = Date.now();
    fs.writeFileSync(this.config.stateFile, JSON.stringify(state, null, 2));
    return state;
  }
  resetState() { return this.writeState(freshState()); }
}
