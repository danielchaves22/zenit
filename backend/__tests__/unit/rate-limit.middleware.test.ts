describe('rate-limit middleware', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.clearAllMocks();
  });

  it('bypasses API rate limiting in test environment', async () => {
    process.env.NODE_ENV = 'test';

    const { createRateLimitMiddleware } = require('../../src/middlewares/rate-limit.middleware');
    const middleware = createRateLimitMiddleware('api');
    const next = jest.fn();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis()
    };

    await middleware(
      {
        ip: '127.0.0.1',
        path: '/api/test',
        connection: {},
        socket: {}
      },
      res,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
