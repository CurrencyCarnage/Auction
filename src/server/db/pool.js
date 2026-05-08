import pg from 'pg';

export function createPool(config) {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL storage.');
  return new pg.Pool({
    connectionString: config.databaseUrl,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });
}
