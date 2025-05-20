// backend/jest.global-setup.js
const { execSync } = require('child_process');
const path = require('path');

module.exports = async () => {
  // Carrega as vars do .env.test
  require('dotenv').config({ path: path.resolve(__dirname, '.env.test') });
  process.env.NODE_ENV = 'test';

  console.log('> [jest.global-setup] Migrating test database once before all suites...');
  execSync(
    // certifique-se de que o prisma CLI está instalado localmente
    'npx prisma migrate deploy --schema=./prisma/schema.prisma',
    { stdio: 'inherit', env: process.env }
  );
};
