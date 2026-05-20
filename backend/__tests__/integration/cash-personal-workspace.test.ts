import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Cash personal workspace bootstrap', () => {
  const uniqueSuffix = Date.now();
  const personalEmail = `cash-personal-${uniqueSuffix}@test.com`;
  const memberEmail = `cash-member-${uniqueSuffix}@test.com`;
  const testPassword = 'secret123';

  let personalUserId: number | null = null;
  let memberUserId: number | null = null;
  let workspaceCompanyId: number | null = null;
  let accessibleCompanyId: number | null = null;
  let inaccessibleCompanyId: number | null = null;

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(testPassword, 10);

    const personalUser = await prisma.user.create({
      data: {
        email: personalEmail,
        password: passwordHash,
        name: 'Cash Personal User',
        role: 'USER'
      }
    });
    personalUserId = personalUser.id;

    const memberUser = await prisma.user.create({
      data: {
        email: memberEmail,
        password: passwordHash,
        name: 'Cash Member User',
        role: 'USER'
      }
    });
    memberUserId = memberUser.id;

    const accessibleCompany = await prisma.company.create({
      data: {
        name: `Cash Accessible ${uniqueSuffix}`,
        code: Number(String(uniqueSuffix).slice(-6)) + 401,
        timeZone: 'America/Sao_Paulo'
      }
    });
    accessibleCompanyId = accessibleCompany.id;

    const inaccessibleCompany = await prisma.company.create({
      data: {
        name: `Cash Inaccessible ${uniqueSuffix}`,
        code: Number(String(uniqueSuffix).slice(-6)) + 402
      }
    });
    inaccessibleCompanyId = inaccessibleCompany.id;

    const cashApp = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });

    await prisma.userCompany.createMany({
      data: [
        {
          userId: memberUser.id,
          companyId: accessibleCompany.id,
          role: 'USER',
          isDefault: true
        },
        {
          userId: memberUser.id,
          companyId: inaccessibleCompany.id,
          role: 'USER',
          isDefault: false
        }
      ]
    });

    await prisma.companyAppEntitlement.create({
      data: {
        companyId: accessibleCompany.id,
        appId: cashApp.id,
        enabled: true
      }
    });
    await prisma.userAppGrant.create({
      data: {
        userId: memberUser.id,
        companyId: accessibleCompany.id,
        appId: cashApp.id,
        granted: true
      }
    });
  });

  afterAll(async () => {
    for (const finalCompanyId of [
      workspaceCompanyId,
      accessibleCompanyId,
      inaccessibleCompanyId,
    ]) {
      if (finalCompanyId == null) {
        continue;
      }

      await prisma.financialTransaction.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.creditCardInvoice.deleteMany({
        where: { account: { companyId: finalCompanyId } }
      });
      await prisma.budgetEntry.deleteMany({
        where: { budget: { companyId: finalCompanyId } }
      });
      await prisma.budget.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.financialTag.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.userAppGrant.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.companyAppEntitlement.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.userCompany.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.financialAccount.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.financialCategory.deleteMany({ where: { companyId: finalCompanyId } });
      await prisma.company.deleteMany({ where: { id: finalCompanyId } });
    }

    const userIds = [personalUserId, memberUserId].filter(
      (value): value is number => value !== null
    );
    if (userIds.length > 0) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in: userIds
          }
        }
      });
    }

    await prisma.$disconnect();
  });

  it('allows login without companies and provisions a personal workspace on demand', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .send({
        email: personalEmail,
        password: testPassword
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.email).toBe(personalEmail);
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
    expect(workspace?.personalWorkspaceOwnerId).toBe(personalUserId);
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

  it('allows selecting an existing company only when the user already has cash access', async () => {
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .send({
        email: memberEmail,
        password: testPassword
      });

    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user.companies).toHaveLength(2);
    const token = loginResponse.body.token as string;

    const accessibleResponse = await request(app)
      .post('/api/cash/bootstrap/select-company')
      .set('Authorization', `Bearer ${token}`)
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .send({
        companyId: accessibleCompanyId
      });

    expect(accessibleResponse.status).toBe(200);
    expect(accessibleResponse.body).toEqual({
      companyId: accessibleCompanyId,
      name: `Cash Accessible ${uniqueSuffix}`,
      timeZone: 'America/Sao_Paulo'
    });

    const deniedResponse = await request(app)
      .post('/api/cash/bootstrap/select-company')
      .set('Authorization', `Bearer ${token}`)
      .set(APP_KEY_HEADER, APP_KEY_VALUE)
      .send({
        companyId: inaccessibleCompanyId
      });

    expect(deniedResponse.status).toBe(403);
    expect(deniedResponse.body).toEqual({
      error: 'Usuario sem acesso efetivo ao Zenit Cash nesta empresa'
    });
  });
});
