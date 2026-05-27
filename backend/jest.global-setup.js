const { spawnSync } = require('child_process');
const {
  backendRoot,
  loadTestEnv,
  assertSafeTestDatabase
} = require('./scripts/test-env');

module.exports = async () => {
  loadTestEnv();
  const { databaseName, schema } = assertSafeTestDatabase();

  console.log(
    `> [jest.global-setup] Resetting integration database "${databaseName}"${schema ? ` (schema: ${schema})` : ''}...`
  );

  const prismaCli = require.resolve('prisma/build/index.js');
  const result = spawnSync(
    process.execPath,
    [
      prismaCli,
      'migrate',
      'reset',
      '--force',
      '--skip-seed',
      '--skip-generate',
      '--schema=./prisma/schema.prisma'
    ],
    {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit'
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Prisma migrate reset failed with exit code ${result.status}.`);
  }
};
