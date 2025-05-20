import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Cria a empresa Equinox com code 0 (primeira empresa)
  const company = await prisma.company.create({
    data: {
      name: 'Equinox',
      address: 'Endereço Padrão', // Altere conforme necessário
      code: 0                   // Código da empresa: fixo para Equinox
    }
  });
  console.log('Empresa Equinox criada:', company);

  // Cria o usuário admin com role ADMIN
  const hashedPassword = await bcrypt.hash('@dmin05c10', 10);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@equinox.com.br',
      password: hashedPassword,
      name: 'Admin',
      role: Role.ADMIN
    }
  });
  console.log('Usuário admin criado:', adminUser);

  // Cria a associação entre o usuário admin e a empresa Equinox
  const userCompany = await prisma.userCompany.create({
    data: {
      userId: adminUser.id,
      companyId: company.id,
      isDefault: true
    }
  });
  console.log('Associação admin/Equinox criada:', userCompany);
}

main()
  .catch((error) => {
    console.error('Erro no seed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
