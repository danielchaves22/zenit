// /backend/__tests__/user.test.ts

import request from 'supertest';
import app from '../src/app';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('User routes (CRUD & RBAC)', () => {
  let adminToken: string;
  let superToken: string;
  let userToken: string;
  let equinoxId: number;
  let otherCompanyId: number;
  let adminId: number;
  let superId: number;
  let userId: number;

  beforeAll(async () => {
    // Limpa todas as tabelas envolvidas
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();

    // Cria empresas de teste
    const equinox = await prisma.company.create({ data: { name: 'Equinox', code: 0 } });
    const other = await prisma.company.create({ data: { name: 'Outra', code: 1 } });
    equinoxId = equinox.id;
    otherCompanyId = other.id;

    // Cria usuários: ADMIN, SUPERUSER e USER
    const hash = await bcrypt.hash('P@ssw0rd', 10);
    const ad = await prisma.user.create({
      data: { email: 'admin@equinox.com', password: hash, name: 'Admin', role: 'ADMIN' }
    });
    const su = await prisma.user.create({
      data: { email: 'super@outra.com', password: hash, name: 'Super', role: 'SUPERUSER' }
    });
    const us = await prisma.user.create({
      data: { email: 'user@outra.com', password: hash, name: 'User', role: 'USER' }
    });
    adminId = ad.id;
    superId = su.id;
    userId = us.id;

    // Associações de empresa
    await prisma.userCompany.create({ data: { userId: adminId, companyId: equinoxId, isDefault: true } });
    await prisma.userCompany.create({ data: { userId: superId, companyId: otherCompanyId, isDefault: true } });
    await prisma.userCompany.create({ data: { userId: userId, companyId: otherCompanyId, isDefault: true } });

    // Gera tokens
    const resAd = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@equinox.com', password: 'P@ssw0rd' });
    adminToken = resAd.body.token;

    const resSu = await request(app)
      .post('/api/auth/login')
      .send({ email: 'super@outra.com', password: 'P@ssw0rd' });
    superToken = resSu.body.token;

    const resUs = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@outra.com', password: 'P@ssw0rd' });
    userToken = resUs.body.token;
  });

  afterAll(async () => {
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    await prisma.$disconnect();
  });

  describe('GET /api/users', () => {
    it('ADMIN vê todos os usuários', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', equinoxId.toString());
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
    });

    it('SUPERUSER vê só usuários da sua empresa', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(res.status).toBe(200);
      expect(res.body.map((u: any) => u.email).sort()).toEqual(
        ['super@outra.com', 'user@outra.com'].sort()
      );
    });

    it('USER vê apenas seu próprio registro', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].email).toBe('user@outra.com');
    });
  });

  describe('POST /api/users', () => {
    it('ADMIN pode criar usuário em qualquer empresa', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', equinoxId.toString())
        .send({
          email: 'novo@outra.com',
          password: '1234',
          name: 'Novo',
          companyId: otherCompanyId,
          newRole: 'USER'
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('SUPERUSER não pode criar em outra empresa', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString())
        .send({
          email: 'x@equinox.com',
          password: '1234',
          name: 'X',
          companyId: equinoxId,
          newRole: 'USER'
        });
      expect(res.status).toBe(403);
    });

    it('USER não pode criar usuários', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', otherCompanyId.toString())
        .send({
          email: 'y@outra.com',
          password: '1234',
          name: 'Y',
          companyId: otherCompanyId,
          newRole: 'USER'
        });
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/users/:id', () => {
    it('ADMIN pode ver qualquer usuário pelo ID', async () => {
      const res = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', equinoxId.toString());
      expect(res.status).toBe(200);
      expect(res.body.email).toBe('user@outra.com');
    });

    it('SUPERUSER pode ver usuários da sua empresa', async () => {
      const res = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(res.status).toBe(200);
    });

    it('SUPERUSER não pode ver usuários de outra empresa', async () => {
      const res = await request(app)
        .get(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(res.status).toBe(403);
    });

    it('USER só pode ver seu próprio perfil', async () => {
      const resOk = await request(app)
        .get(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(resOk.status).toBe(200);

      const resNo = await request(app)
        .get(`/api/users/${superId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(resNo.status).toBe(403);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('ADMIN pode editar qualquer usuário', async () => {
      const res = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', equinoxId.toString())
        .send({ name: 'User Edited By Admin' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('User Edited By Admin');
    });

    it('SUPERUSER pode editar usuário da própria empresa', async () => {
      const res = await request(app)
        .put(`/api/users/${superId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString())
        .send({ name: 'Super Edited' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Super Edited');
    });

    it('SUPERUSER não pode editar usuário de outra empresa', async () => {
      const res = await request(app)
        .put(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString())
        .send({ name: 'Should Fail' });
      expect(res.status).toBe(403);
    });

    it('USER pode editar apenas seu próprio perfil', async () => {
      const resOk = await request(app)
        .put(`/api/users/${userId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', otherCompanyId.toString())
        .send({ name: 'User Self-Edited' });
      expect(resOk.status).toBe(200);
      expect(resOk.body.name).toBe('User Self-Edited');

      const resNo = await request(app)
        .put(`/api/users/${superId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', otherCompanyId.toString())
        .send({ name: 'Attempt Fail' });
      expect(resNo.status).toBe(403);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('ADMIN pode excluir qualquer usuário', async () => {
      const temp = await prisma.user.create({
        data: { email: 'todelete@outra.com', password: await bcrypt.hash('pass',10), name: 'Temp', role: 'USER' }
      });
      await prisma.userCompany.create({
        data: { userId: temp.id, companyId: otherCompanyId, isDefault: true }
      });
      const res = await request(app)
        .delete(`/api/users/${temp.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', equinoxId.toString());
      expect(res.status).toBe(204);
    });

    it('SUPERUSER pode excluir usuário da própria empresa', async () => {
      const temp2 = await prisma.user.create({
        data: { email: 'temp2@outra.com', password: await bcrypt.hash('pass',10), name: 'Temp2', role: 'USER' }
      });
      await prisma.userCompany.create({
        data: { userId: temp2.id, companyId: otherCompanyId, isDefault: true }
      });
      const res = await request(app)
        .delete(`/api/users/${temp2.id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(res.status).toBe(204);
    });

    it('SUPERUSER não pode excluir usuário de outra empresa', async () => {
      const res = await request(app)
        .delete(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${superToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(res.status).toBe(403);
    });

    it('USER não pode excluir usuários', async () => {
      const res = await request(app)
        .delete(`/api/users/${superId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', otherCompanyId.toString());
      expect(res.status).toBe(403);
    });
  });
});
