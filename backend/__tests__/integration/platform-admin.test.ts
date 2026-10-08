import request from 'supertest';
import bcrypt from 'bcrypt';
import { AppKey, PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import path from 'path';
import app from '../../src/app';
import { generateToken } from '../../src/utils/jwt';
import AppAccessService from '../../src/services/app-access.service';

const prisma = new PrismaClient();
const suffix = `platform-${Date.now()}`;
const headers = (id: number, appKey = 'zenit-admin', companyId?: number) => ({
  Authorization: `Bearer ${generateToken({ userId: id })}`,
  'X-App-Key': appKey,
  ...(companyId ? { 'X-Company-Id': String(companyId) } : {})
});

describe('Administração global do Zenit', () => {
  let adminId: number, managerId: number, userId: number, companyId: number;
  let password: string;
  const companyIds: number[] = [];
  beforeAll(async () => {
    password = await bcrypt.hash('Senha-QA-2026', 10);
    const company = await prisma.company.create({ data: { name: suffix, code: Number(Date.now().toString().slice(-7)) } });
    companyId = company.id;
    companyIds.push(companyId);
    for (const [name, role] of [['admin', 'ADMIN'], ['manager', 'USER'], ['user', 'USER']] as const) {
      const user = await prisma.user.create({ data: { name, role, email: `${name}-${suffix}@example.test`, password, mustChangePassword: false } });
      if (name === 'admin') adminId = user.id;
      else {
        if (name === 'manager') managerId = user.id; else userId = user.id;
        await prisma.userCompany.create({ data: { userId: user.id, companyId, role: name === 'manager' ? 'SUPERUSER' : 'USER' } });
        await AppAccessService.setUserGrants(user.id, companyId, [{ appKey: AppKey.ZENIT_CASH, granted: true }]);
      }
    }
    await AppAccessService.setCompanyEntitlements(companyId, [{ appKey: AppKey.ZENIT_CASH, enabled: true }]);
    // Simulate old Admin entitlements and grants already persisted before the release.
    const adminApp = await prisma.ecosystemApp.findUniqueOrThrow({ where: { appKey: AppKey.ZENIT_ADMIN } });
    await prisma.companyAppEntitlement.create({ data: { companyId, appId: adminApp.id, enabled: true } });
    await prisma.userAppGrant.createMany({ data: [managerId, userId].map(id => ({ userId: id, companyId, appId: adminApp.id, granted: true })) });
  });
  afterAll(async () => {
    const users = await prisma.user.findMany({ where: { email: { contains: suffix } }, select: { id: true } });
    const ids = users.map(user => user.id);
    await prisma.userAppGrant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userCompany.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userPreference.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.companyAppEntitlement.deleteMany({ where: { companyId: { in: companyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$disconnect();
  });

  it('administrador sem empresa faz login, recupera sessão e administra outra empresa', async () => {
    const login = await request(app).post('/api/auth/login').set('X-App-Key', 'zenit-admin')
      .send({ email: `admin-${suffix}@example.test`, password: 'Senha-QA-2026' });
    expect(login.status).toBe(200);
    expect(login.body.user).toMatchObject({ platformAdmin: true, companies: [] });
    expect((await request(app).get('/api/auth/me').set(headers(adminId))).body.user.platformAdmin).toBe(true);
    expect((await request(app).get('/api/companies').set(headers(adminId))).status).toBe(200);
    const updated = await request(app).put(`/api/companies/${companyId}`).set(headers(adminId))
      .send({ appEntitlements: [{ appKey: 'zenit-bizz', enabled: true }] });
    expect(updated.status).toBe(200);
    expect(await AppAccessService.hasEffectiveAccess(adminId, companyId, AppKey.ZENIT_BIZZ)).toBe(false);
  });

  it('não permite autocadastro no Admin nem cria uma conta residual', async () => {
    const email = `signup-${suffix}@example.test`;
    expect((await request(app).post('/api/auth/register').set('X-App-Key', 'zenit-admin')
      .send({ name: 'Não criar', email, password: 'Senha-QA-2026' })).status).toBe(403);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it('grants antigos, perfil da empresa e header forjado não concedem acesso à plataforma', async () => {
    for (const id of [managerId, userId]) {
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect((await request(app).post('/api/auth/login').set('X-App-Key', 'zenit-admin')
        .send({ email: user.email, password: 'Senha-QA-2026' })).status).toBe(403);
      expect((await request(app).get('/api/auth/me').set(headers(id))).status).toBe(403);
      expect((await request(app).get('/api/companies').set(headers(id, 'zenit-admin', companyId))).status).toBe(403);
    }
    await prisma.userCompany.update({ where: { userId_companyId: { userId: managerId, companyId } }, data: { role: 'ADMIN' } });
    expect((await request(app).get('/api/companies').set(headers(managerId, 'zenit-admin', companyId))).status).toBe(403);
    expect((await request(app).put(`/api/companies/${companyId}`).set(headers(managerId, 'zenit-cash', companyId)).send({ name: 'negado' })).status).toBe(403);
    await prisma.userCompany.update({ where: { userId_companyId: { userId: managerId, companyId } }, data: { role: 'SUPERUSER' } });
  });

  it('Admin não aparece entre aplicativos de empresas e usuários e não pode ser concedido por grants', async () => {
    for (const data of [await AppAccessService.listCatalog(), await AppAccessService.getCompanyEntitlements(companyId),
      await AppAccessService.getUserGrants(managerId, companyId), await AppAccessService.getEffectiveAccess(managerId, companyId)]) {
      expect(data.some(entry => entry.appKey === 'zenit-admin')).toBe(false);
    }
    expect((await AppAccessService.buildDefaultGrantsForCompanies([companyId])).some(entry => entry.appKey === AppKey.ZENIT_ADMIN)).toBe(false);
    expect((await request(app).put(`/api/companies/${companyId}`).set(headers(adminId))
      .send({ appEntitlements: [{ appKey: 'zenit-admin', enabled: true }] })).status).toBe(400);
    expect((await request(app).put(`/api/users/${userId}`).set(headers(managerId, 'zenit-cash', companyId))
      .send({ appGrants: [{ companyId, appKey: 'zenit-admin', granted: true }] })).status).toBe(400);
  });

  it('superusuário não cria, promove ou redefine senha de administrador da plataforma', async () => {
    expect((await request(app).post('/api/users').set(headers(managerId, 'zenit-cash', companyId))
      .send({ name: 'Escalada', email: `escalada-${suffix}@example.test`, password: 'senha', companyId, newRole: 'USER', platformAdmin: true })).status).toBe(403);
    expect((await request(app).put(`/api/users/${userId}`).set(headers(managerId, 'zenit-cash', companyId)).send({ platformAdmin: true })).status).toBe(403);
    await prisma.userCompany.create({ data: { userId: adminId, companyId, role: 'USER' } });
    for (const body of [{ password: 'tomada-de-conta' }, { platformAdmin: false }]) {
      expect((await request(app).put(`/api/users/${adminId}`).set(headers(managerId, 'zenit-cash', companyId)).send(body)).status).toBe(403);
    }
    expect((await request(app).delete(`/api/users/${adminId}`).set(headers(managerId, 'zenit-cash', companyId))).status).toBe(403);
    // A global admin using Cash can still edit their own profile, without changing platform access.
    await AppAccessService.setUserGrants(adminId, companyId, [{ appKey: AppKey.ZENIT_CASH, granted: true }]);
    expect((await request(app).put(`/api/users/${adminId}`).set(headers(adminId, 'zenit-cash', companyId))
      .send({ name: 'Admin perfil atualizado' })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).role).toBe('ADMIN');
    await prisma.userCompany.delete({ where: { userId_companyId: { userId: adminId, companyId } } });
    // Account takeover through re-registering a company-less admin is rejected too.
    expect((await request(app).post('/api/users').set(headers(managerId, 'zenit-cash', companyId))
      .send({ name: 'Escalada', email: `admin-${suffix}@example.test`, password: 'senha', companyId, newRole: 'USER' })).status).toBe(400);
  });

  it('administrador cria e revoga acesso global sem depender de uma empresa', async () => {
    const created = await request(app).post('/api/users').set(headers(adminId))
      .send({ name: 'Novo admin', email: `new-${suffix}@example.test`, password: 'senha', platformAdmin: true, companies: [] });
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('ADMIN');
    const id = created.body.id;
    expect((await request(app).get('/api/users').set(headers(id))).status).toBe(200);
    expect((await request(app).put(`/api/users/${id}`).set(headers(adminId))
      .send({ platformAdmin: false, companies: [{ companyId, role: 'SUPERUSER' }] })).status).toBe(200);
    expect((await request(app).get('/api/companies').set(headers(id))).status).toBe(403);
    expect((await request(app).post('/api/auth/refresh').set('X-App-Key', 'zenit-admin')
      .send({ refreshToken: generateToken({ userId: id }) })).status).toBe(403);
  });

  it('administrador não remove o próprio acesso nem exclui a própria conta', async () => {
    expect((await request(app).put(`/api/users/${adminId}`).set(headers(adminId)).send({ platformAdmin: false })).status).toBe(403);
    expect((await request(app).delete(`/api/users/${adminId}`).set(headers(adminId))).status).toBe(403);
  });

  it('Admin exige empresa explícita nas configurações específicas e não abre dados operacionais', async () => {
    for (const url of ['/api/financial/accounts', `/api/users/${userId}/account-access`, '/api/app-access/company/entitlements']) {
      expect((await request(app).get(url).set(headers(adminId))).status).toBe(400);
    }
    expect((await request(app).get('/api/financial/accounts').set(headers(adminId, 'zenit-admin', companyId))).status).toBe(200);
    for (const url of ['/api/financial/transactions', '/api/bizz/session', '/api/cash/bootstrap']) {
      expect((await request(app).get(url).set(headers(adminId, 'zenit-admin', companyId))).status).toBe(403);
    }
    expect((await request(app).get('/api/bizz/session').set(headers(adminId, 'zenit-bizz', companyId))).status).toBe(403);
  });

  it('administra serviços da empresa, bancos e preferências sem empresa ativa', async () => {
    for (const url of [`/api/admin/companies/${companyId}/openai`, '/api/admin/banks', '/api/preferences']) {
      expect((await request(app).get(url).set(headers(adminId))).status).toBe(200);
    }
  });

  it('migração preserva somente administradores globais e legados da Equinox', async () => {
    const equinox = await prisma.company.findUnique({ where: { code: 0 } });
    const migration = readFileSync(path.resolve(__dirname, '../../prisma/migrations/20261008190000_platform_admin_access/migration.sql'), 'utf8');
    // Roll back this isolated data migration rehearsal, including fixture memberships.
    const rollback = new Error('rollback migration rehearsal');
    await expect(prisma.$transaction(async tx => {
      const eq = equinox || await tx.company.create({ data: { name: 'Equinox QA', code: 0 } });
      await tx.userCompany.create({ data: { userId, companyId: eq.id, role: 'ADMIN' } });
      await tx.userCompany.update({ where: { userId_companyId: { userId: managerId, companyId } }, data: { role: 'ADMIN' } });
      for (const sql of migration.split(';').filter(sql => sql.trim())) await tx.$executeRawUnsafe(sql);
      expect((await tx.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe('ADMIN');
      expect((await tx.user.findUniqueOrThrow({ where: { id: adminId } })).role).toBe('ADMIN');
      expect((await tx.user.findUniqueOrThrow({ where: { id: managerId } })).role).toBe('USER');
      expect((await tx.userCompany.findUniqueOrThrow({ where: { userId_companyId: { userId, companyId: eq.id } } })).role).toBe('SUPERUSER');
      throw rollback;
    })).rejects.toThrow(rollback);
  });
});
