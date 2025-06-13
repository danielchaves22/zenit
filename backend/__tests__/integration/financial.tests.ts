import request from 'supertest';
import app from '../src/app';
import { PrismaClient, AccountType, TransactionType, TransactionStatus } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

describe('Módulo Financeiro', () => {
  let adminToken: string;
  let adminId: number;
  let companyId: number;
  let checkingAccountId: number;
  let savingsAccountId: number;
  let expenseCategoryId: number;
  let incomeCategoryId: number;
  let userToken: string;
  let userId: number;

  beforeAll(async () => {
    // Limpeza das tabelas financeiras
    await prisma.financialTransaction.deleteMany();
    await prisma.financialTag.deleteMany();
    await prisma.financialCategory.deleteMany();
    await prisma.financialAccount.deleteMany();

    // Limpeza das tabelas de usuário/empresa
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();

    // Criação de empresa de teste
    const company = await prisma.company.create({ 
      data: { name: 'Empresa Teste', code: 999 } 
    });
    companyId = company.id;

    // Criação de usuário admin para testes
    const hash = await bcrypt.hash('senha123', 10);
    const admin = await prisma.user.create({
      data: {
        email: 'admin@teste.com',
        password: hash,
        name: 'Admin Teste',
        role: 'ADMIN'
      }
    });
    adminId = admin.id;

    // Criação de usuário comum
    const user = await prisma.user.create({
      data: {
        email: 'user@teste.com',
        password: hash,
        name: 'User Teste',
        role: 'USER'
      }
    });
    userId = user.id;

    // Associação usuário-empresa
    await prisma.userCompany.create({
      data: { userId: admin.id, companyId, isDefault: true, role: 'ADMIN' }
    });
    await prisma.userCompany.create({
      data: { userId: userId, companyId, isDefault: false, role: 'USER' }
    });

    // Login para obter token
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@teste.com', password: 'senha123' });

    adminToken = res.body.token;

    const resUser = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@teste.com', password: 'senha123' });
    userToken = resUser.body.token;
  });

  afterAll(async () => {
    // Limpeza final
    await prisma.financialTransaction.deleteMany();
    await prisma.financialTag.deleteMany();
    await prisma.financialCategory.deleteMany();
    await prisma.financialAccount.deleteMany();
    await prisma.userCompany.deleteMany();
    await prisma.user.deleteMany();
    await prisma.company.deleteMany();
    await prisma.$disconnect();
  });

  describe('Contas Financeiras', () => {
    it('Deve criar uma conta corrente com saldo inicial zero', async () => {
      const res = await request(app)
        .post('/api/financial/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          name: 'Conta Corrente',
          type: 'CHECKING',
          initialBalance: 0,
          bankName: 'Banco Teste'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Conta Corrente');
      expect(res.body.balance).toBe('0.00');
      
      checkingAccountId = res.body.id;
    });

    it('Deve criar uma conta poupança com saldo inicial 1000', async () => {
      const res = await request(app)
        .post('/api/financial/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          name: 'Poupança',
          type: 'SAVINGS',
          initialBalance: 1000,
          bankName: 'Banco Teste'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Poupança');
      expect(res.body.balance).toBe('1000.00');
      
      savingsAccountId = res.body.id;
    });

    it('Deve listar as contas criadas', async () => {
      const res = await request(app)
        .get('/api/financial/accounts')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString());

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((a: any) => a.name).sort()).toEqual(['Conta Corrente', 'Poupança'].sort());

      // Concede acesso da conta corrente ao usuário comum
      await prisma.userFinancialAccountAccess.create({
        data: {
          userId,
          financialAccountId: checkingAccountId,
          companyId,
          grantedBy: adminId
        }
      });
    });

    it('Impede ter mais de uma conta padrão', async () => {
      await prisma.financialAccount.update({
        where: { id: checkingAccountId },
        data: { isDefault: true }
      });

      await expect(
        prisma.financialAccount.update({
          where: { id: savingsAccountId },
          data: { isDefault: true }
        })
      ).rejects.toThrow();

      const count = await prisma.financialAccount.count({
        where: { companyId, isDefault: true }
      });

      expect(count).toBe(1);
    });
  });

  describe('Categorias Financeiras', () => {
    it('Deve criar uma categoria de despesa', async () => {
      const res = await request(app)
        .post('/api/financial/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          name: 'Alimentação',
          type: 'EXPENSE',
          color: '#FF5733'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Alimentação');
      expect(res.body.type).toBe('EXPENSE');
      
      expenseCategoryId = res.body.id;
    });

    it('Deve criar uma categoria de receita', async () => {
      const res = await request(app)
        .post('/api/financial/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          name: 'Salário',
          type: 'INCOME',
          color: '#33FF57'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Salário');
      expect(res.body.type).toBe('INCOME');
      
      incomeCategoryId = res.body.id;
    });

    it('Deve listar as categorias criadas', async () => {
      const res = await request(app)
        .get('/api/financial/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString());

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body.map((c: any) => c.name).sort()).toEqual(['Alimentação', 'Salário'].sort());
    });
  });

  describe('Transações Financeiras', () => {
    it('Deve criar uma transação de despesa', async () => {
      const res = await request(app)
        .post('/api/financial/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          description: 'Compra Supermercado',
          amount: 150.75,
          date: new Date().toISOString(),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: checkingAccountId,
          categoryId: expenseCategoryId,
          tags: ['Supermercado', 'Alimentação']
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.description).toBe('Compra Supermercado');
      expect(res.body.amount).toBe('150.75');
      expect(res.body.type).toBe('EXPENSE');
    });

    it('Deve atualizar o saldo da conta após criação de despesa', async () => {
      const account = await prisma.financialAccount.findUnique({
        where: { id: checkingAccountId }
      });

      expect(account).not.toBeNull();
      expect(account?.balance.toString()).toBe('-150.75');
    });

    it('Deve criar uma transação de receita', async () => {
      const res = await request(app)
        .post('/api/financial/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          description: 'Salário Mensal',
          amount: 3000,
          date: new Date().toISOString(),
          type: 'INCOME',
          status: 'COMPLETED',
          toAccountId: checkingAccountId,
          categoryId: incomeCategoryId,
          tags: ['Salário']
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.description).toBe('Salário Mensal');
      expect(res.body.amount).toBe('3000.00');
      expect(res.body.type).toBe('INCOME');
    });

    it('Deve atualizar o saldo da conta após criação de receita', async () => {
      const account = await prisma.financialAccount.findUnique({
        where: { id: checkingAccountId }
      });

      expect(account).not.toBeNull();
      // -150.75 + 3000 = 2849.25
      expect(account?.balance.toString()).toBe('2849.25');
    });

    it('Deve criar uma transação de transferência', async () => {
      const res = await request(app)
        .post('/api/financial/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          description: 'Transferência para Poupança',
          amount: 500,
          date: new Date().toISOString(),
          type: 'TRANSFER',
          status: 'COMPLETED',
          fromAccountId: checkingAccountId,
          toAccountId: savingsAccountId,
          tags: ['Transferência', 'Poupança']
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.description).toBe('Transferência para Poupança');
      expect(res.body.amount).toBe('500.00');
      expect(res.body.type).toBe('TRANSFER');
    });

    it('Deve atualizar os saldos das contas após transferência', async () => {
      const checking = await prisma.financialAccount.findUnique({
        where: { id: checkingAccountId }
      });

      const savings = await prisma.financialAccount.findUnique({
        where: { id: savingsAccountId }
      });

      expect(checking).not.toBeNull();
      expect(savings).not.toBeNull();
      
      // 2849.25 - 500 = 2349.25
      expect(checking?.balance.toString()).toBe('2349.25');
      
      // 1000 + 500 = 1500
      expect(savings?.balance.toString()).toBe('1500.00');
    });

    it('Deve cancelar uma transação e reverter o saldo', async () => {
      // Primeiro, cria uma transação de despesa
      const createRes = await request(app)
        .post('/api/financial/transactions')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          description: 'Compra para Cancelar',
          amount: 200,
          date: new Date().toISOString(),
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: checkingAccountId,
          categoryId: expenseCategoryId
        });

      expect(createRes.status).toBe(201);
      const transactionId = createRes.body.id;

      // Verifica o saldo após a despesa
      let account = await prisma.financialAccount.findUnique({
        where: { id: checkingAccountId }
      });
      
      // 2349.25 - 200 = 2149.25
      expect(account?.balance.toString()).toBe('2149.25');

      // Agora cancela a transação
      const updateRes = await request(app)
        .patch(`/api/financial/transactions/${transactionId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString())
        .send({
          status: 'CANCELED'
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.status).toBe('CANCELED');

      // Verifica se o saldo voltou ao valor anterior
      account = await prisma.financialAccount.findUnique({
        where: { id: checkingAccountId }
      });
      
      // Deve voltar a 2349.25
      expect(account?.balance.toString()).toBe('2349.25');
    });

    it('Deve obter um resumo financeiro', async () => {
      const res = await request(app)
        .get('/api/financial/summary')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Company-Id', companyId.toString());

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('income');
      expect(res.body).toHaveProperty('expense');
      expect(res.body).toHaveProperty('balance');
      expect(res.body).toHaveProperty('accounts');
      
      // Valores podem variar dependendo do mês, mas devem existir
      expect(typeof res.body.income).toBe('number');
      expect(typeof res.body.expense).toBe('number');
      expect(typeof res.body.balance).toBe('number');
      expect(Array.isArray(res.body.accounts)).toBe(true);
    });

    it('Usuário comum vê apenas contas permitidas no resumo', async () => {
      const res = await request(app)
        .get('/api/financial/summary')
        .set('Authorization', `Bearer ${userToken}`)
        .set('X-Company-Id', companyId.toString());

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.accounts)).toBe(true);
      expect(res.body.accounts).toHaveLength(1);
      expect(res.body.accounts[0].id).toBe(checkingAccountId);
    });
  });
});
