import request from 'supertest';
import app from '../src/app';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('Regra de conta ativa única', () => {
  let token: string;
  let companyId: number;
  let firstAccountId: number;

  beforeAll(async () => {
    await prisma.financialAccount.deleteMany();
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();

    const company = await prisma.company.create({ data: { name: 'Empresa', code: 123 } });
    companyId = company.id;

    const hash = await bcrypt.hash('senha', 10);
    const user = await prisma.user.create({
      data: { email: 'admin@e.com', password: hash, name: 'Admin', role: 'ADMIN' }
    });

    await prisma.userCompany.create({ data: { userId: user.id, companyId, isDefault: true } });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@e.com', password: 'senha' });

    token = res.body.token;
  });

  afterAll(async () => {
    await prisma.financialAccount.deleteMany();
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    await prisma.$disconnect();
  });

  it('impede criar segunda conta ativa', async () => {
    const r1 = await request(app)
      .post('/api/financial/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Conta A', type: 'CHECKING', initialBalance: 0 });
    expect(r1.status).toBe(201);
    firstAccountId = r1.body.id;

    const r2 = await request(app)
      .post('/api/financial/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Conta B', type: 'CHECKING', initialBalance: 0 });
    expect(r2.status).toBe(400);
  });

  it('permite nova ativa após inativar a anterior', async () => {
    await request(app)
      .put(`/api/financial/accounts/${firstAccountId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false })
      .expect(200);

    const r3 = await request(app)
      .post('/api/financial/accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Conta B', type: 'CHECKING', initialBalance: 0 });
    expect(r3.status).toBe(201);
  });
});
