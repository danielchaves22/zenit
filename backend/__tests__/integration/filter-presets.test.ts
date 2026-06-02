import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';
const FEATURE_KEY = 'financial-transactions';

function buildPresetPayload(overrides?: Record<string, unknown>) {
  return {
    version: 1,
    dateField: 'dueDate',
    periodPreset: 'CURRENT_MONTH',
    periodOffset: 0,
    types: ['EXPENSE', 'TRANSFER'],
    status: 'PENDING',
    accountId: '',
    categoryId: '',
    search: 'aluguel',
    showOnlyMaterialized: false,
    ...overrides
  };
}

describe('Filter presets preferences', () => {
  let userId: number;
  let companyId: number;
  let secondaryCompanyId: number;
  let token: string;

  const authHeaders = (activeCompanyId = companyId) => ({
    Authorization: `Bearer ${token}`,
    'X-Company-Id': activeCompanyId.toString(),
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  beforeAll(async () => {
    const companyCodeBase = Number(`9${String(Date.now()).slice(-7)}`);

    const company = await prisma.company.create({
      data: {
        name: 'Company Filter Preset Primary',
        code: companyCodeBase
      }
    });
    companyId = company.id;

    const secondaryCompany = await prisma.company.create({
      data: {
        name: 'Company Filter Preset Secondary',
        code: companyCodeBase + 1
      }
    });
    secondaryCompanyId = secondaryCompany.id;

    const passwordHash = await bcrypt.hash('secret123', 10);
    const user = await prisma.user.create({
      data: {
        email: `filter-presets-${Date.now()}@test.com`,
        password: passwordHash,
        name: 'Filter Preset Admin',
        role: 'ADMIN'
      }
    });
    userId = user.id;

    await prisma.userCompany.createMany({
      data: [
        {
          userId,
          companyId,
          isDefault: true,
          role: 'ADMIN',
          manageFinancialAccounts: true,
          manageFinancialCategories: true
        },
        {
          userId,
          companyId: secondaryCompanyId,
          isDefault: false,
          role: 'ADMIN',
          manageFinancialAccounts: true,
          manageFinancialCategories: true
        }
      ]
    });

    const ecosystemApp = await prisma.ecosystemApp.upsert({
      where: { appKey: AppKey.ZENIT_CASH },
      update: { name: 'Zenit Cash', isActive: true },
      create: { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash', isActive: true }
    });

    await prisma.companyAppEntitlement.createMany({
      data: [
        {
          companyId,
          appId: ecosystemApp.id,
          enabled: true
        },
        {
          companyId: secondaryCompanyId,
          appId: ecosystemApp.id,
          enabled: true
        }
      ],
      skipDuplicates: true
    });

    await prisma.userAppGrant.createMany({
      data: [
        {
          userId,
          companyId,
          appId: ecosystemApp.id,
          granted: true
        },
        {
          userId,
          companyId: secondaryCompanyId,
          appId: ecosystemApp.id,
          granted: true
        }
      ],
      skipDuplicates: true
    });

    token = generateToken({ userId });
  });

  beforeEach(async () => {
    await prisma.lastUsedFilterPreset.deleteMany({
      where: {
        userId,
        companyId: { in: [companyId, secondaryCompanyId] }
      }
    });

    await prisma.savedFilterPreset.deleteMany({
      where: {
        userId,
        companyId: { in: [companyId, secondaryCompanyId] }
      }
    });
  });

  afterAll(async () => {
    await prisma.lastUsedFilterPreset.deleteMany({
      where: {
        userId,
        companyId: { in: [companyId, secondaryCompanyId] }
      }
    });
    await prisma.savedFilterPreset.deleteMany({
      where: {
        userId,
        companyId: { in: [companyId, secondaryCompanyId] }
      }
    });
    await prisma.userAppGrant.deleteMany({
      where: {
        userId,
        companyId: { in: [companyId, secondaryCompanyId] }
      }
    });
    await prisma.companyAppEntitlement.deleteMany({
      where: {
        companyId: { in: [companyId, secondaryCompanyId] }
      }
    });
    await prisma.userCompany.deleteMany({
      where: {
        userId,
        companyId: { in: [companyId, secondaryCompanyId] }
      }
    });
    await prisma.company.deleteMany({
      where: {
        id: { in: [companyId, secondaryCompanyId] }
      }
    });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('creates presets and returns the created preset as last used for the current company', async () => {
    const createResponse = await request(app)
      .post('/api/preferences/filter-presets')
      .set(authHeaders())
      .send({
        featureKey: FEATURE_KEY,
        name: 'Despesas em aberto',
        payload: buildPresetPayload()
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.preset.name).toBe('Despesas em aberto');
    expect(createResponse.body.preset.featureKey).toBe(FEATURE_KEY);
    expect(createResponse.body.lastUsedPresetId).toBe(createResponse.body.preset.id);

    const listResponse = await request(app)
      .get('/api/preferences/filter-presets')
      .set(authHeaders())
      .query({ featureKey: FEATURE_KEY });

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.lastUsedPresetId).toBe(createResponse.body.preset.id);
    expect(listResponse.body.presets).toHaveLength(1);
    expect(listResponse.body.presets[0].payload.search).toBe('aluguel');
  });

  it('marks a preset as last used and clears the pointer when that preset is deleted', async () => {
    const firstResponse = await request(app)
      .post('/api/preferences/filter-presets')
      .set(authHeaders())
      .send({
        featureKey: FEATURE_KEY,
        name: 'Preset 1',
        payload: buildPresetPayload({ search: 'primeiro' })
      });

    const secondResponse = await request(app)
      .post('/api/preferences/filter-presets')
      .set(authHeaders())
      .send({
        featureKey: FEATURE_KEY,
        name: 'Preset 2',
        payload: buildPresetPayload({ search: 'segundo' })
      });

    const firstPresetId = firstResponse.body.preset.id;
    const secondPresetId = secondResponse.body.preset.id;

    const markResponse = await request(app)
      .put(`/api/preferences/filter-presets/${firstPresetId}/last-used`)
      .set(authHeaders());

    expect(markResponse.status).toBe(200);
    expect(markResponse.body.lastUsedPresetId).toBe(firstPresetId);

    const listAfterMark = await request(app)
      .get('/api/preferences/filter-presets')
      .set(authHeaders())
      .query({ featureKey: FEATURE_KEY });

    expect(listAfterMark.status).toBe(200);
    expect(listAfterMark.body.lastUsedPresetId).toBe(firstPresetId);

    const deleteResponse = await request(app)
      .delete(`/api/preferences/filter-presets/${firstPresetId}`)
      .set(authHeaders());

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.lastUsedPresetId).toBeNull();

    const listAfterDelete = await request(app)
      .get('/api/preferences/filter-presets')
      .set(authHeaders())
      .query({ featureKey: FEATURE_KEY });

    expect(listAfterDelete.status).toBe(200);
    expect(listAfterDelete.body.lastUsedPresetId).toBeNull();
    expect(listAfterDelete.body.presets).toHaveLength(1);
    expect(listAfterDelete.body.presets[0].id).toBe(secondPresetId);
  });

  it('keeps presets isolated by company', async () => {
    const createResponse = await request(app)
      .post('/api/preferences/filter-presets')
      .set(authHeaders(companyId))
      .send({
        featureKey: FEATURE_KEY,
        name: 'Preset empresa primaria',
        payload: buildPresetPayload()
      });

    expect(createResponse.status).toBe(201);

    const secondaryListResponse = await request(app)
      .get('/api/preferences/filter-presets')
      .set(authHeaders(secondaryCompanyId))
      .query({ featureKey: FEATURE_KEY });

    expect(secondaryListResponse.status).toBe(200);
    expect(secondaryListResponse.body.presets).toHaveLength(0);
    expect(secondaryListResponse.body.lastUsedPresetId).toBeNull();
  });
});
