import request from 'supertest';
import { PrismaClient, TransactionType } from '@prisma/client';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';

const prisma = new PrismaClient();
const APP_KEY_HEADER = 'x-app-key';
const APP_KEY_VALUE = 'zenit-cash';

describe('Personal financial profile', () => {
  let userId: number;
  let otherUserId: number;
  let token: string;
  let otherToken: string;
  let personalWorkspaceId: number;
  let otherPersonalWorkspaceId: number;
  let expenseCategoryIds: number[];
  let foreignExpenseCategoryId: number;

  const headers = (authToken = token) => ({
    Authorization: `Bearer ${authToken}`,
    [APP_KEY_HEADER]: APP_KEY_VALUE
  });

  const completePayload = () => ({
    planningContext: 'INDIVIDUAL',
    adultsCount: 1,
    dependentsCount: 0,
    financialDataCoverage: 'FULL',
    emergencyReserveTargetMonths: 6,
    planningStyle: 'BALANCED',
    adjustmentPace: 'GRADUAL',
    categoryPrioritiesReviewed: true,
    categoryPreferences: expenseCategoryIds.map((categoryId, index) => ({
      categoryId,
      flexibility: index === 0 ? 'PROTECTED' : 'MODERATE',
      minimumMonthlyAmount: index === 0 ? '500.00' : null
    }))
  });

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [user, otherUser] = await Promise.all([
      prisma.user.create({
        data: {
          email: `financial-profile-${suffix}@test.com`,
          password: 'test-hash',
          name: 'Personal Profile Owner',
          role: 'USER'
        }
      }),
      prisma.user.create({
        data: {
          email: `financial-profile-other-${suffix}@test.com`,
          password: 'test-hash',
          name: 'Other Personal Profile Owner',
          role: 'USER'
        }
      })
    ]);
    userId = user.id;
    otherUserId = otherUser.id;
    token = generateToken({ userId });
    otherToken = generateToken({ userId: otherUserId });

    const [initialResponse, otherInitialResponse] = await Promise.all([
      request(app).get('/api/me/financial-profile').set(headers(token)),
      request(app).get('/api/me/financial-profile').set(headers(otherToken))
    ]);

    expect(initialResponse.status).toBe(200);
    expect(otherInitialResponse.status).toBe(200);

    personalWorkspaceId = initialResponse.body.personalWorkspace.id;
    otherPersonalWorkspaceId = otherInitialResponse.body.personalWorkspace.id;
    expenseCategoryIds = initialResponse.body.categories.map(
      (category: { id: number }) => category.id
    );
    foreignExpenseCategoryId = otherInitialResponse.body.categories[0].id;
  });

  beforeEach(async () => {
    await prisma.personalFinancialProfile.deleteMany({ where: { ownerUserId: userId } });
    await prisma.financialCategory.deleteMany({
      where: {
        companyId: personalWorkspaceId,
        isDefault: false,
        name: { startsWith: 'Categoria nova do perfil' }
      }
    });
  });

  afterAll(async () => {
    await prisma.personalFinancialProfile.deleteMany({
      where: { ownerUserId: { in: [userId, otherUserId] } }
    });

    for (const companyId of [personalWorkspaceId, otherPersonalWorkspaceId]) {
      await prisma.userAppGrant.deleteMany({ where: { companyId } });
      await prisma.companyAppEntitlement.deleteMany({ where: { companyId } });
      await prisma.userCompany.deleteMany({ where: { companyId } });
      await prisma.financialAccount.deleteMany({ where: { companyId } });
      await prisma.financialCategory.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }

    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it('resolves the private personal workspace without requiring an active company', async () => {
    const response = await request(app)
      .get('/api/me/financial-profile')
      .set(headers());

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      state: 'NOT_CONFIGURED',
      completionPercentage: 0,
      profile: null,
      personalWorkspace: { id: personalWorkspaceId }
    });
    expect(response.body.categories).toHaveLength(expenseCategoryIds.length);
    expect(
      response.body.categories.every((category: { id: number }) =>
        expenseCategoryIds.includes(category.id)
      )
    ).toBe(true);
  });

  it('saves a complete profile with immutable revisions and both ownership links', async () => {
    const firstSave = await request(app)
      .put('/api/me/financial-profile')
      .set(headers())
      .send(completePayload());

    expect(firstSave.status).toBe(200);
    expect(firstSave.body).toMatchObject({
      state: 'READY',
      completionPercentage: 100,
      profile: {
        ownerUserId: userId,
        version: 1,
        categoryPrioritiesReviewed: true,
        personalWorkspace: { id: personalWorkspaceId }
      }
    });

    const secondSave = await request(app)
      .put('/api/me/financial-profile')
      .set(headers())
      .send({ ...completePayload(), emergencyReserveTargetMonths: 9 });

    expect(secondSave.status).toBe(200);
    expect(secondSave.body.profile.version).toBe(2);
    expect(secondSave.body.profile.emergencyReserveTargetMonths).toBe(9);

    const stored = await prisma.personalFinancialProfile.findUnique({
      where: { ownerUserId: userId },
      include: { revisions: { orderBy: { version: 'asc' } } }
    });
    expect(stored?.personalWorkspaceId).toBe(personalWorkspaceId);
    expect(stored?.revisions.map((revision) => revision.version)).toEqual([1, 2]);
  });

  it('preserves a completed category review while the remaining profile is incomplete', async () => {
    const response = await request(app)
      .put('/api/me/financial-profile')
      .set(headers())
      .send({ ...completePayload(), planningStyle: null });

    expect(response.status).toBe(200);
    expect(response.body.state).toBe('INCOMPLETE');
    expect(response.body.profile.categoryPrioritiesReviewed).toBe(true);
    expect(response.body.profile.categoryPrioritiesReviewedAt).not.toBeNull();
    expect(response.body.profile.lastReviewedAt).toBeNull();
  });

  it('rejects category preferences from another personal workspace', async () => {
    const response = await request(app)
      .put('/api/me/financial-profile')
      .set(headers())
      .send({
        ...completePayload(),
        categoryPrioritiesReviewed: false,
        categoryPreferences: [
          {
            categoryId: foreignExpenseCategoryId,
            flexibility: 'FLEXIBLE',
            minimumMonthlyAmount: null
          }
        ]
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      'Uma ou mais categorias não pertencem ao workspace pessoal'
    );
  });

  it('marks a ready profile for review when a new expense category appears', async () => {
    const saveResponse = await request(app)
      .put('/api/me/financial-profile')
      .set(headers())
      .send(completePayload());
    expect(saveResponse.body.state).toBe('READY');

    await prisma.financialCategory.create({
      data: {
        companyId: personalWorkspaceId,
        name: `Categoria nova do perfil ${Date.now()}`,
        type: TransactionType.EXPENSE,
        color: '#f97316'
      }
    });

    const response = await request(app)
      .get('/api/me/financial-profile')
      .set(headers());

    expect(response.status).toBe(200);
    expect(response.body.state).toBe('OUTDATED');
    expect(response.body.completionPercentage).toBe(88);
  });

  it('never exposes one user profile to another user', async () => {
    await request(app)
      .put('/api/me/financial-profile')
      .set(headers())
      .send(completePayload());

    const response = await request(app)
      .get('/api/me/financial-profile')
      .set(headers(otherToken));

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      state: 'NOT_CONFIGURED',
      profile: null,
      personalWorkspace: { id: otherPersonalWorkspaceId }
    });
  });
});
