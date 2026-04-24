// backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

const EQUINOX_COMPANY_CODE = 0;
const ADMIN_EMAIL = 'admin@equinox.com.br';
const ADMIN_PASSWORD = '@dmin05c10';
const APP_CATALOG = [
  { appKey: 'ZENIT_CASH', name: 'Zenit Cash' },
  { appKey: 'ZENIT_CALC', name: 'Zenit Calc' },
  { appKey: 'ZENIT_ADMIN', name: 'Zenit Admin' }
];

async function main() {
  try {
    console.log('[seed] Starting seed...');

    await prisma.$connect();
    console.log('[seed] Database connection ready.');

    const company = await prisma.company.upsert({
      where: { code: EQUINOX_COMPANY_CODE },
      update: {},
      create: {
        name: 'Equinox',
        address: 'Endereco Padrao',
        code: EQUINOX_COMPANY_CODE,
      },
    });

    console.log('[seed] Company ensured:', { id: company.id, code: company.code });

    await createDefaultFinancialStructure(company.id);

    let adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    let adminCreatedNow = false;

    if (!adminUser) {
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

      adminUser = await prisma.user.create({
        data: {
          email: ADMIN_EMAIL,
          password: hashedPassword,
          name: 'Admin',
          role: 'ADMIN',
          mustChangePassword: false,
        },
      });

      adminCreatedNow = true;
      console.log('[seed] Admin user created:', { id: adminUser.id, email: adminUser.email });
    } else {
      adminUser = await prisma.user.update({
        where: { id: adminUser.id },
        data: {
          role: 'ADMIN',
          mustChangePassword: false,
        },
      });

      console.log('[seed] Admin user already existed. Role/default flags normalized.');
    }

    const existingUserCompany = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: adminUser.id,
          companyId: company.id,
        },
      },
    });

    if (!existingUserCompany) {
      await prisma.userCompany.create({
        data: {
          userId: adminUser.id,
          companyId: company.id,
          isDefault: true,
          role: 'ADMIN',
        },
      });

      console.log('[seed] Admin-company link created.');
    } else {
      await prisma.userCompany.update({
        where: { id: existingUserCompany.id },
        data: {
          isDefault: true,
          role: 'ADMIN',
        },
      });

      console.log('[seed] Admin-company link already existed. Flags normalized.');
    }

    await ensureAppAccess(company.id, adminUser.id);

    console.log('[seed] Seed completed successfully.');

    if (adminCreatedNow) {
      console.log(`[seed] Login credentials: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    } else {
      console.log(`[seed] Admin user ensured for: ${ADMIN_EMAIL}`);
    }
  } catch (error) {
    console.error('[seed] Error:', error);
    throw error;
  }
}

async function createDefaultFinancialStructure(companyId) {
  console.log('[seed] Ensuring default financial structure...');

  const [existingAccount, existingCategory] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { companyId } }),
    prisma.financialCategory.findFirst({ where: { companyId } }),
  ]);

  if (existingAccount || existingCategory) {
    console.log('[seed] Financial structure already exists. Skipping.');
    return { defaultStructure: null };
  }

  return prisma.$transaction(async (tx) => {
    const defaultAccount = await tx.financialAccount.create({
      data: {
        name: 'Conta Principal',
        type: 'CHECKING',
        balance: 0,
        companyId,
        isActive: true,
        isDefault: true,
      },
    });

    const expenseCategory = await tx.financialCategory.create({
      data: {
        name: 'Despesas Gerais',
        type: 'EXPENSE',
        color: '#DC2626',
        companyId,
        isDefault: true,
      },
    });

    const incomeCategory = await tx.financialCategory.create({
      data: {
        name: 'Outras Receitas',
        type: 'INCOME',
        color: '#16A34A',
        companyId,
        isDefault: true,
      },
    });

    console.log('[seed] Default financial structure created:', {
      accountId: defaultAccount.id,
      expenseCategoryId: expenseCategory.id,
      incomeCategoryId: incomeCategory.id,
    });

    return {
      defaultStructure: {
        account: defaultAccount,
        expenseCategory,
        incomeCategory,
      },
    };
  });
}

async function ensureAppAccess(companyId, userId) {
  for (const app of APP_CATALOG) {
    const catalogItem = await prisma.ecosystemApp.upsert({
      where: { appKey: app.appKey },
      update: { name: app.name, isActive: true },
      create: { appKey: app.appKey, name: app.name, isActive: true }
    });

    await prisma.companyAppEntitlement.upsert({
      where: {
        unique_company_app_entitlement: {
          companyId,
          appId: catalogItem.id
        }
      },
      update: { enabled: true },
      create: { companyId, appId: catalogItem.id, enabled: true }
    });

    await prisma.userAppGrant.upsert({
      where: {
        unique_user_company_app_grant: {
          userId,
          companyId,
          appId: catalogItem.id
        }
      },
      update: { granted: true },
      create: { userId, companyId, appId: catalogItem.id, granted: true }
    });
  }
}

main()
  .catch((error) => {
    console.error('[seed] Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('[seed] Database disconnected.');
  });
