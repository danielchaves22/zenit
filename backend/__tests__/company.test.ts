import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('Company routes (RBAC)', () => {
  let adminToken: string;
  let superToken: string;
  let userToken: string;
  let equinoxId: number;
  let otherCompanyId: number;

  beforeAll(async () => {
    // Limpeza completa
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();

    // Criação de empresas
    const eq = await prisma.company.create({ data: { name: 'Equinox', code: 0 } });
    const ot = await prisma.company.create({ data: { name: 'Outra', code: 1 } });
    equinoxId = eq.id;
    otherCompanyId = ot.id;

    // Criação de usuários
    const hash = await bcrypt.hash('Senha123', 10);
    const ad = await prisma.user.create({ data: { email: 'admin@e.com', password: hash, name: 'Adm', role: 'ADMIN' } });
    const su = await prisma.user.create({ data: { email: 'super@o.com', password: hash, name: 'Sup', role: 'SUPERUSER' } });
    const us = await prisma.user.create({ data: { email: 'user@o.com', password: hash, name: 'User', role: 'USER' } });

    // Associações
    await prisma.userCompany.create({ data: { userId: ad.id, companyId: eq.id, isDefault: true } });
    await prisma.userCompany.create({ data: { userId: su.id, companyId: ot.id, isDefault: true } });
    await prisma.userCompany.create({ data: { userId: us.id, companyId: ot.id, isDefault: true } });

    // Tokens
    const r1 = await request(app).post('/api/auth/login').send({ email: 'admin@e.com', password: 'Senha123' });
    adminToken = r1.body.token;
    const r2 = await request(app).post('/api/auth/login').send({ email: 'super@o.com', password: 'Senha123' });
    superToken = r2.body.token;
    const r3 = await request(app).post('/api/auth/login').send({ email: 'user@o.com', password: 'Senha123' });
    userToken = r3.body.token;
  });

  afterAll(async () => {
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    await prisma.$disconnect();
  });

  describe('POST /api/companies', () => {
    it('ADMIN pode criar empresa', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Nova', address: 'Rua X' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('SUPERUSER não pode criar empresa', async () => {
      const res = await request(app)
        .post('/api/companies')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Err', address: 'Rua Y' });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/companies', () => {
    it('ADMIN vê todas as empresas', async () => {
      const res = await request(app)
        .get('/api/companies')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      // Existem pelo menos Equinox e Outra
      expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('SUPERUSER não pode listar', async () => {
      const res = await request(app)
        .get('/api/companies')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(403);
    });

    it('USER não pode listar', async () => {
      const res = await request(app)
        .get('/api/companies')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/companies/:id', () => {
    it('ADMIN pode editar empresa', async () => {
      const res = await request(app)
        .put(`/api/companies/${equinoxId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'EquinoxX' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('EquinoxX');
    });

    it('SUPERUSER não pode editar', async () => {
      const res = await request(app)
        .put(`/api/companies/${otherCompanyId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'Teste' });
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/companies/:id', () => {
    it('ADMIN pode excluir', async () => {
      const nova = await prisma.company.create({ data: { name: 'Temp', code: 99 } });
      const res = await request(app)
        .delete(`/api/companies/${nova.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(204);
    });

    it('USER não pode excluir', async () => {
      const res = await request(app)
        .delete(`/api/companies/${equinoxId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});
