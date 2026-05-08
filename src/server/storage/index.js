import { JsonAuctionStore } from './jsonStore.js';

export function createStore(config) {
  return new JsonAuctionStore(config);
}
