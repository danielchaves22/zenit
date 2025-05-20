module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
  
    // 1) roda apenas uma vez antes de qualquer suíte
    globalSetup: '<rootDir>/jest.global-setup.js',
  
    // 2) carrega .env.test antes de cada worker (sem migrations)
    setupFiles: ['<rootDir>/jest.setup.js']
  };
  