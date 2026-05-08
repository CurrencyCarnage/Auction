import { createPool } from '../db/pool.js';

export class PostgresAuctionStore {
  constructor(config) {
    this.config = config;
    this.pool = createPool(config);
  }

  readState() {
    throw new Error('PostgreSQL storage adapter is scaffolded but not implemented yet. Keep STORAGE_DRIVER=json until adapter parity is complete.');
  }
  writeState() {
    throw new Error('PostgreSQL storage adapter is scaffolded but not implemented yet. Keep STORAGE_DRIVER=json until adapter parity is complete.');
  }
  resetState() {
    throw new Error('PostgreSQL storage adapter is scaffolded but not implemented yet. Keep STORAGE_DRIVER=json until adapter parity is complete.');
  }
}
