const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const backendRoot = path.resolve(__dirname, '..');
const testEnvPath = path.join(backendRoot, '.env.test');

function loadTestEnv(options = {}) {
  const { required = true } = options;

  if (!fs.existsSync(testEnvPath)) {
    if (required) {
      throw new Error(
        `Missing ${testEnvPath}. Create it from .env.test.example before running integration tests.`
      );
    }

    return false;
  }

  dotenv.config({ path: testEnvPath, override: true });
  process.env.NODE_ENV = 'test';
  return true;
}

function assertSafeTestDatabase(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run integration tests.');
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(databaseUrl);
  } catch (error) {
    throw new Error(`Invalid DATABASE_URL for integration tests: ${databaseUrl}`);
  }

  const databaseName = parsedUrl.pathname.replace(/^\//, '');
  const schema = parsedUrl.searchParams.get('schema') || '';
  const safetyMarker = `${databaseName} ${schema}`.trim();

  if (!/test/i.test(safetyMarker)) {
    throw new Error(
      `Refusing to run integration tests against a non-test database: ${databaseUrl}`
    );
  }

  return { databaseName, schema };
}

module.exports = {
  backendRoot,
  testEnvPath,
  loadTestEnv,
  assertSafeTestDatabase
};
