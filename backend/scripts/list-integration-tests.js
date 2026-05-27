const fs = require('fs');
const path = require('path');

const integrationDir = path.resolve(__dirname, '..', '__tests__', 'integration');

function collectTests(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

for (const testFile of collectTests(integrationDir).sort()) {
  console.log(testFile);
}
