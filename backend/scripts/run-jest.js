const { spawnSync } = require('child_process');
const path = require('path');

const mode = process.argv[2] || 'all';
const extraArgs = process.argv.slice(3);
const backendRoot = path.resolve(__dirname, '..');
const validModes = new Set(['all', 'unit', 'integration']);

if (!validModes.has(mode)) {
  console.error(`Invalid test mode "${mode}". Use one of: all, unit, integration.`);
  process.exit(1);
}

const env = { ...process.env };

if (mode === 'unit') {
  env.TEST_TYPE = 'unit';
} else {
  delete env.TEST_TYPE;
}

const jestBin = require.resolve('jest/bin/jest');
const result = spawnSync(process.execPath, [jestBin, ...extraArgs], {
  cwd: backendRoot,
  env,
  stdio: 'inherit'
});

if (result.error) {
  throw result.error;
}

process.exit(result.status === null ? 1 : result.status);
