import crypto from 'crypto';
import path from 'path';

export function createConfig(dirname) {
  const demoMode = process.env.DEMO_MODE !== 'false';
  const adminUsername = process.env.ADMIN_USERNAME || (demoMode ? 'admin' : '');
  const adminPassword = process.env.ADMIN_PASSWORD || (demoMode ? 'admin' : '');
  if (!demoMode && (!adminUsername || !adminPassword)) {
    throw new Error('Production mode requires ADMIN_USERNAME and ADMIN_PASSWORD environment variables.');
  }
  const storageDriver = process.env.STORAGE_DRIVER || 'json';
  if (storageDriver === 'postgres' && !process.env.DATABASE_URL) {
    throw new Error('STORAGE_DRIVER=postgres requires DATABASE_URL.');
  }
  return {
    port: process.env.PORT || 4173,
    demoMode,
    adminUsername,
    adminPassword,
    adminSessionToken: process.env.ADMIN_SESSION_TOKEN || crypto.randomBytes(32).toString('hex'),
    sessionSecret: process.env.SESSION_SECRET || process.env.ADMIN_SESSION_TOKEN || crypto.randomBytes(32).toString('hex'),
    storageDriver,
    databaseUrl: process.env.DATABASE_URL,
    dataDir: process.env.DATA_DIR || path.join(dirname, 'data'),
    stateFile: path.join(process.env.DATA_DIR || path.join(dirname, 'data'), 'state.json'),
  };
}
