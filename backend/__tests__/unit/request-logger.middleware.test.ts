jest.mock('../../src/utils/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn() } }));
import { requestLogger } from '../../src/middlewares/request-logger.middleware';
import { logger } from '../../src/utils/logger';

describe('WhatsApp HTTP log levels', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each([202, 401, 500])('logs successful callbacks at debug and failures at warn (%s)', (statusCode) => {
    const req = { path: '/api/webhooks/whatsapp', method: 'POST', get: () => 'Meta' } as any;
    const res = { send: jest.fn(), statusCode } as any;
    requestLogger(req, res, jest.fn());
    res.send({ accepted: true });
    expect(logger.log).toHaveBeenNthCalledWith(1, 'debug', 'Incoming request', expect.any(Object));
    expect(logger.log).toHaveBeenNthCalledWith(2, statusCode >= 400 ? 'warn' : 'debug', 'Request completed', expect.any(Object));
  });
});
