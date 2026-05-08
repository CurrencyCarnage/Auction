import { spawn, spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for postgres parity test.');
  process.exit(2);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status || 1);
}
async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/healthz`);
      if (res.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error('Server did not become healthy in time');
}

const env = {
  ...process.env,
  STORAGE_DRIVER: 'postgres',
  DEMO_MODE: 'true',
  ADMIN_SESSION_TOKEN: process.env.ADMIN_SESSION_TOKEN || 'postgres-parity-test-token',
  PORT: process.env.PORT || '4174',
};
const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${env.PORT}`;

console.log('Running migrations...');
run('node', ['src/server/db/migrate.js'], env);
console.log('Seeding demo data...');
run('node', ['src/server/db/seedDemo.js'], env);

console.log('Starting app with STORAGE_DRIVER=postgres...');
const child = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', d => process.stdout.write(d));
child.stderr.on('data', d => process.stderr.write(d));

try {
  await waitForHealth(baseUrl);
  run('node', ['scripts/smoke-test.mjs'], { ...env, SMOKE_BASE_URL: baseUrl });
  run('node', ['scripts/behavior-test.mjs'], { ...env, SMOKE_BASE_URL: baseUrl });
  console.log('Postgres parity test passed');
} finally {
  child.kill('SIGTERM');
}
