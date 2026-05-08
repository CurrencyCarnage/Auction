import { JsonAuctionStore } from './jsonStore.js';
import { PostgresAuctionStore } from './postgresStore.js';

export function createStore(config) {
  if (config.storageDriver === 'postgres') return new PostgresAuctionStore(config);
  return new JsonAuctionStore(config);
}
