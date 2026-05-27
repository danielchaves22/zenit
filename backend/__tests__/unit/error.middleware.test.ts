import { errorHandler } from '../../src/middlewares/error.middleware';
import { logger } from '../../src/utils/logger';

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('errorHandler', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('redacts sensitive values before logging request context', () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger as any);
    const req = {
      path: '/api/auth/login',
      method: 'POST',
      params: { id: '7' },
      query: { token: 'query-secret' },
      body: {
        email: 'user@example.com',
        password: 'super-secret',
        nested: {
          apiKey: 'api-secret',
          refreshToken: 'refresh-secret'
        },
        items: [
          { accessToken: 'access-secret' }
        ]
      },
      user: { userId: 99 }
    } as any;
    const res = createResponse();
    const err = Object.assign(new Error('boom'), { statusCode: 500 });

    errorHandler(err, req, res as any, jest.fn());

    expect(errorSpy).toHaveBeenCalledTimes(1);

    const logContext = (errorSpy.mock.calls[0] as any[])[1] as any;
    expect(logContext.query.token).toBe('[REDACTED]');
    expect(logContext.body.password).toBe('[REDACTED]');
    expect(logContext.body.nested.apiKey).toBe('[REDACTED]');
    expect(logContext.body.nested.refreshToken).toBe('[REDACTED]');
    expect(logContext.body.items[0].accessToken).toBe('[REDACTED]');
    expect(logContext.body.email).toBe('user@example.com');
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
