import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Cash personal workspace bootstrap', () => {
  const testEmail = `cash-personal-${Date.now()}@test.com`;
  const testPassword = 'secret123';
  let userId: number | null = null;
  let workspaceCompanyId: number | null = null;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(testPassword, 10);
    const user = await prisma.user.create({
      data: {
        email: testEmail,
        password: passwordHash,
        name: 'Cash Personal User',
        role: 'USER'
      }
    });

    userId = user.id;
  });

  afterAll(async () => {
    if (workspaceCompanyId) {
      await prisma.financialTransaction.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.creditCardInvoice.deleteMany({
        where: { account: { companyId: workspaceCompanyId } }
      });
      await prisma.budgetEntry.deleteMany({
        where: { budget: { companyId: workspaceCompanyId } }
      });
      await prisma.budget.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.financialTag.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.userAppGrant.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.companyAppEntitlement.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.userCompany.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.financialAccount.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.financialCategory.deleteMany({ where: { companyId: workspaceCompanyId } });
      await prisma.company.deleteMany({ where: { id: workspaceCompanyId } });
    }

    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }

    await prisma.$disconnect();
  });

  it('allows login without companies and provisions a personal workspace on demand', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .send({
        email: testEmail,
        password: testPassword
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe(testEmail);
    expect(loginResponse.body.user.companies).toEqual([]);

    const token = loginResponse.body.token as string;

    const createResponse = await request(app)
      .get('/api/cash/personal-workspace')
      .set('Authorization', `Bearer ${token}`)
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .set('X-Device-Timezone', 'America/Sao_Paulo');

    expect(createResponse.status).toBe(200);
    expect(createResponse.body.created).toBe(true);
    expect(typeof createResponse.body.companyId).toBe('number');
    expect(createResponse.body.name).toContain('Workspace pessoal');
    expect(createResponse.body.timeZone).toBe('America/Sao_Paulo');

    workspaceCompanyId = createResponse.body.companyId;
    const resolvedWorkspaceCompanyId = workspaceCompanyId!;

    const workspace = await prisma.company.findUnique({
      where: { id: resolvedWorkspaceCompanyId },
      include: {
        users: true,
        appEntitlements: {
          include: { app: true }
        },
        userAppGrants: {
          include: { app: true }
        }
      }
    });

    expect(workspace).not.toBeNull();
    expect(workspace?.isPersonalWorkspace).toBe(true);
    expect(workspace?.personalWorkspaceOwnerId).toBe(userId);
    expect(workspace?.users).toHaveLength(1);
    expect(workspace?.users[0].isDefault).toBe(true);
    expect(workspace?.users[0].role).toBe('SUPERUSER');
    expect(workspace?.timeZone).toBe('America/Sao_Paulo');

    const entitlementsByKey = Object.fromEntries(
      (workspace?.appEntitlements ?? []).map((entry: { app: { appKey: AppKey }; enabled: boolean }) => [
        entry.app.appKey,
        entry.enabled
      ])
    );
    const grantsByKey = Object.fromEntries(
      (workspace?.userAppGrants ?? []).map((entry: { app: { appKey: AppKey }; granted: boolean }) => [
        entry.app.appKey,
        entry.granted
      ])
    );

    expect(entitlementsByKey[AppKey.ZENIT_CASH]).toBe(true);
    expect(entitlementsByKey[AppKey.ZENIT_CALC]).toBe(false);
    expect(entitlementsByKey[AppKey.ZENIT_ADMIN]).toBe(false);
    expect(grantsByKey[AppKey.ZENIT_CASH]).toBe(true);
    expect(grantsByKey[AppKey.ZENIT_CALC]).toBe(false);
    expect(grantsByKey[AppKey.ZENIT_ADMIN]).toBe(false);

    const secondResponse = await request(app)
      .get('/api/cash/personal-workspace')
      .set('Authorization', `Bearer ${token}`)
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .set('X-Device-Timezone', 'Europe/Lisbon');

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.created).toBe(false);
    expect(secondResponse.body.companyId).toBe(resolvedWorkspaceCompanyId);
    expect(secondResponse.body.timeZone).toBe('America/Sao_Paulo');
  });
});
