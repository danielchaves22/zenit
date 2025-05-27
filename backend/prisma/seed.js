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

    const { defaultAccount } = await createDefaultFinancialStructure(company.id)

    // Cria o usuário admin com role ADMIN
    const hashedPassword = await bcrypt.hash('@dmin05c10', 10);
    console.log('🔐 Senha hasheada gerada');

    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@equinox.com.br',
        password: hashedPassword,
        name: 'Admin',
        role: 'ADMIN'
      }
    });
    console.log('✅ Usuário admin criado:', { id: adminUser.id, email: adminUser.email, role: adminUser.role });

    // Cria a associação entre o usuário admin e a empresa Equinox
    const userCompany = await prisma.userCompany.create({
      data: {
        userId: adminUser.id,
        companyId: company.id,
        isDefault: true
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

// Adicionar ao backend/prisma/seed.js após criar empresa e usuário admin

async function createDefaultFinancialStructure(companyId) {
  console.log('🏦 Criando estrutura financeira padrão...');

  // 1. Conta padrão "Caixa Geral"
  const defaultAccount = await prisma.financialAccount.create({
    data: {
      name: 'Caixa Geral',
      type: 'CHECKING',
      balance: 0,
      companyId: companyId,
      accountNumber: null,
      bankName: null,
      isActive: true
    }
  });

  // 2. Categorias padrão simplificadas
  const categories = [
    { name: 'Receita Geral', type: 'INCOME', color: '#16A34A' },
    { name: 'Vendas', type: 'INCOME', color: '#059669' },
    { name: 'Serviços', type: 'INCOME', color: '#0D9488' },
    
    { name: 'Despesa Operacional', type: 'EXPENSE', color: '#DC2626' },
    { name: 'Fornecedores', type: 'EXPENSE', color: '#B91C1C' },
    { name: 'Impostos e Taxas', type: 'EXPENSE', color: '#991B1B' },
    { name: 'Despesas Administrativas', type: 'EXPENSE', color: '#7F1D1D' },
  ];

  for (const category of categories) {
    await prisma.financialCategory.create({
      data: {
        ...category,
        companyId: companyId
      }
    });
  }

  console.log(`✅ Estrutura padrão criada - Conta: ${defaultAccount.name}, Categorias: ${categories.length}`);
  return { defaultAccount };
}

// Chamar após criar empresa:
// const { defaultAccount } = await createDefaultFinancialStructure(company.id);

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