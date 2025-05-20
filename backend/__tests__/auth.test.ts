// /backend/__tests__/auth.test.ts

import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('Auth routes', () => {
  const testEmail = 'test@example.com';
  const testPassword = 'secret123';

  beforeAll(async () => {
    // 1) Limpa todas as associações e dados de usuário
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    // 2) Limpa todas as empresas
    await prisma.company.deleteMany();

    // 3) Cria as empresas uma a uma e captura os IDs
    const empresaA = await prisma.company.create({
      data: { name: 'Empresa A', code: 0 },
    });
    const empresaB = await prisma.company.create({
      data: { name: 'Empresa B', code: 1 },
    });

    // 4) Cria o usuário hashed
    const hashed = await bcrypt.hash(testPassword, 10);
    const user = await prisma.user.create({
      data: { email: testEmail, password: hashed, name: 'Test User', role: 'USER' }
    });

    // 5) Associa o usuário à segunda empresa (empresaB.id)
    await prisma.userCompany.create({
      data: { userId: user.id, companyId: empresaB.id, isDefault: true }
    });
  });

  afterAll(async () => {
    // Limpa tudo após os testes
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    await prisma.$disconnect();
  });

  it('should login successfully and return a token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(typeof res.body.token).toBe('string');
  });

  it('should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Credenciais inválidas.' });
  });
});
