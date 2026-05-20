import request from 'supertest';
import app from '../../src/app';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('Auth routes', () => {
  const uniqueSuffix = Date.now().toString();
  const testEmail = `auth.${uniqueSuffix}@example.com`;
  const testPassword = 'secret123';
  let companyIds: number[] = [];

  beforeAll(async () => {
    const empresaA = await prisma.company.create({
      data: { name: `Empresa A ${uniqueSuffix}`, code: Number(uniqueSuffix.slice(-6)) + 300 }
    });
    const empresaB = await prisma.company.create({
      data: { name: `Empresa B ${uniqueSuffix}`, code: Number(uniqueSuffix.slice(-6)) + 301 }
    });
    companyIds = [empresaA.id, empresaB.id];

    const hashed = await bcrypt.hash(testPassword, 10);
    const user = await prisma.user.create({
      data: { email: testEmail, password: hashed, name: 'Test User', role: 'USER' }
    });

    await prisma.userCompany.create({
      data: { userId: user.id, companyId: empresaB.id, isDefault: true, role: 'USER' }
    });
  });

  afterAll(async () => {
    await prisma.userCompany.deleteMany({
      where: { companyId: { in: companyIds } }
    });
    await prisma.user.deleteMany({
      where: { email: testEmail }
    });
    await prisma.company.deleteMany({
      where: { id: { in: companyIds } }
    });
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
    expect(res.body).toEqual({ error: 'Credenciais invalidas' });
  });
});
