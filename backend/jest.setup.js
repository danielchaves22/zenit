const { loadTestEnv } = require('./scripts/test-env');

loadTestEnv({ required: false });
process.env.NODE_ENV = 'test';
