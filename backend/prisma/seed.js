// backend/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

async function main() {
  try {
    console.log('🌱 Iniciando seed...');
    
    // Testa conexão primeiro
    await prisma.$connect();
    console.log('✅ Conexão com banco estabelecida');

    // Verifica se já existe empresa com code 0
    const existingCompany = await prisma.company.findUnique({
      where: { code: 0 }
    });

    if (existingCompany) {
      console.log('⚠️  Empresa Equinox já existe, pulando criação');
      
      // Verifica se admin já existe
      const existingAdmin = await prisma.user.findUnique({
        where: { email: 'admin@equinox.com.br' }
      });
      
      if (existingAdmin) {
        console.log('⚠️  Usuário admin já existe, seed finalizado');
        return;
      }
    }

    // Cria a empresa Equinox com code 0 (primeira empresa)
    const company = existingCompany || await prisma.company.create({
      data: {
        name: 'Equinox',
        address: 'Endereço Padrão',
        code: 0
      }
    });
    console.log('✅ Empresa Equinox criada:', { id: company.id, name: company.name, code: company.code });

    // ✅ CRIAR ESTRUTURA FINANCEIRA PARA EQUINOX (empresa administrativa)
    // A Equinox também recebe estrutura padrão para demonstração/testes
    const { defaultStructure } = await createDefaultFinancialStructure(company.id);

    // Cria o usuário admin com role ADMIN
    const hashedPassword = await bcrypt.hash('@dmin05c10', 10);
    console.log('🔐 Senha hasheada gerada');

    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@equinox.com.br',
        password: hashedPassword,
        name: 'Admin',
        role: 'ADMIN',
        mustChangePassword: false
      }
    });
    console.log('✅ Usuário admin criado:', { id: adminUser.id, email: adminUser.email, role: adminUser.role });

    // Cria a associação entre o usuário admin e a empresa Equinox
    const userCompany = await prisma.userCompany.create({
      data: {
        userId: adminUser.id,
        companyId: company.id,
        isDefault: true,
        role: 'ADMIN'
      }
    });
    console.log('✅ Associação admin/Equinox criada:', { userId: userCompany.userId, companyId: userCompany.companyId });

    console.log('🎉 Seed completado com sucesso!');
    console.log('📧 Você pode fazer login com: admin@equinox.com.br / @dmin05c10');

  } catch (error) {
    console.error('❌ Erro detalhado no seed:', error);
    
    // Log mais específico
    if (error.message) {
      console.error('❌ Mensagem do erro:', error.message);
    }
    if (error.stack) {
      console.error('❌ Stack trace:', error.stack);
    }
    
    throw error;
  }
}

/**
 * ✅ CRIAÇÃO DE ESTRUTURA FINANCEIRA PADRÃO
 * Usado tanto para a empresa Equinox (administrativa) quanto para novas empresas
 * Estrutura padrão simplificada para onboarding
 */
async function createDefaultFinancialStructure(companyId) {
  console.log('🏦 Criando estrutura financeira padrão...');

  // Verificar se já existe estrutura financeira
  const [existingAccount, existingCategory] = await Promise.all([
    prisma.financialAccount.findFirst({ where: { companyId } }),
    prisma.financialCategory.findFirst({ where: { companyId } })
  ]);

  if (existingAccount || existingCategory) {
    console.log('⚠️  Estrutura financeira já existe, pulando criação');
    return { defaultStructure: null };
  }

  return await prisma.$transaction(async (tx) => {
    
    // 1. Conta Principal (padrão)
    const defaultAccount = await tx.financialAccount.create({
      data: {
        name: 'Conta Principal',
        type: 'CHECKING',
        balance: 0,
        companyId: companyId,
        isActive: true,
        isDefault: true // ✅ Marcar como padrão
      }
    });

    // 2. Categoria de despesas (padrão)
    const expenseCategory = await tx.financialCategory.create({
      data: {
        name: 'Despesas Gerais',
        type: 'EXPENSE',
        color: '#DC2626', // Vermelho
        companyId: companyId,
        isDefault: true // ✅ Marcar como padrão
      }
    });

    // 3. Categoria de receitas (padrão)
    const incomeCategory = await tx.financialCategory.create({
      data: {
        name: 'Outras Receitas',
        type: 'INCOME',
        color: '#16A34A', // Verde
        companyId: companyId,
        isDefault: true // ✅ Marcar como padrão
      }
    });

    console.log(`✅ Estrutura financeira padrão criada para Equinox:`);
    console.log(`   - Conta: ${defaultAccount.name} (padrão: ${defaultAccount.isDefault})`);
    console.log(`   - Categoria Despesa: ${expenseCategory.name} (padrão: ${expenseCategory.isDefault})`);
    console.log(`   - Categoria Receita: ${incomeCategory.name} (padrão: ${incomeCategory.isDefault})`);

    return {
      defaultStructure: {
        account: defaultAccount,
        expenseCategory,
        incomeCategory
      }
    };
  });
}

main()
  .catch((error) => {
    console.error('❌ Seed falhou:', error);
    process.exit(1);
  })
  .finally(async () => {
    console.log('🔌 Desconectando do banco...');
    await prisma.$disconnect();
    console.log('✅ Desconectado');
  });