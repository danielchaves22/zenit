const { spawnSync } = require('child_process');
const { backendRoot, loadTestEnv, assertSafeTestDatabase } = require('./test-env');

const prismaArgs = process.argv.slice(2);

if (prismaArgs.length === 0) {
  console.error('Usage: node ./scripts/run-prisma-test.js <prisma args>');
  process.exit(1);
}

loadTestEnv();
assertSafeTestDatabase();

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaCli, ...prismaArgs], {
  cwd: backendRoot,
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  throw result.error;
}

process.exit(result.status === null ? 1 : result.status);
