import { spawnSync } from 'node:child_process';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required for staging setup.');
  process.exit(2);
}

function run(label, command, args) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}

run('Run database migrations', 'node', ['src/server/db/migrate.js']);
run('Seed/update demo data', 'node', ['src/server/db/seedDemo.js']);
console.log('\nStaging setup complete.');
