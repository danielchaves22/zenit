import { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import app from '../../src/app';
import AppAccessService from '../../src/services/app-access.service';
import cacheService from '../../src/services/cache.service';
import { generateToken } from '../../src/utils/jwt';

jest.mock('../../src/middlewares/tenant.middleware', () => ({
  tenantMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req.user, { companyId: 34, role: 'USER', manageFinancialAccounts: false });
    next();
  }
}));

describe('Reconciliation HTTP response cache', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    '/accounts/12/reconciliation/2026-11',
    '/accounts/12/reconciliation-v2/2026-11/items/44/description-suggestion',
    '/credit-cards/12/reconciliation/sessions/2026/11'
  ])('checks current permissions before returning data from %s', async path => {
    jest.spyOn(AppAccessService, 'hasEffectiveAccess').mockResolvedValue(true);
    const cached = jest.spyOn(cacheService, 'get').mockResolvedValue({ suggestedDescription: 'Outro usuário' });
    const response = await request(app).get('/api/financial' + path)
      .set('Authorization', 'Bearer ' + generateToken({ userId: 8 }))
      .set('X-Company-Id', '34').set('X-App-Key', 'zenit-cash');
    expect(response.status).toBe(403);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(cached).not.toHaveBeenCalled();
  });
});
