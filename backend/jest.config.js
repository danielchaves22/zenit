const unit = process.env.TEST_TYPE === 'unit';

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  ...(unit ? {} : { globalSetup: '<rootDir>/jest.global-setup.js' }),
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: unit ? ['<rootDir>/__tests__/integration/'] : [],
};
