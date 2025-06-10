import { PrismaClient, Prisma, Role, User } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Parâmetros para criação de usuário.
 */
export interface CreateUserParams {
  email: string;
  password: string;
  name: string;
  role: Role;
  companyId: number;
  manageFinancialAccounts?: boolean;
  manageFinancialCategories?: boolean;
}

export default class UserService {
  /**
   * Hashea a senha com bcrypt.
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  /**
   * Cria usuário + associação na tabela userCompany.
   * Versão simplificada: um usuário pertence a apenas uma empresa.
   */
  static async createUser(params: CreateUserParams): Promise<Omit<User, 'password'>> {
    const { email, password, name, role, companyId, manageFinancialAccounts = false, manageFinancialCategories = false } = params;
    const hashed = await this.hashPassword(password);

    // Verificar se o usuário já tem alguma associação com empresa
    const existingUser = await prisma.user.findUnique({
      where: { email },
      include: { companies: true }
    });

    if (existingUser) {
      if (existingUser.companies.length > 0) {
        throw new Error('Este email já está associado a uma empresa');
      }
    }

    // Realizar toda a operação em uma transação para garantir consistência
    return prisma.$transaction(async (tx) => {
      // Criar ou atualizar o usuário
      const user = existingUser 
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { name, role, password: hashed, manageFinancialAccounts, manageFinancialCategories }
          })
        : await tx.user.create({
            data: { email, password: hashed, name, role, manageFinancialAccounts, manageFinancialCategories }
          });

      // Criar a associação com a empresa (única)
      await tx.userCompany.create({
        data: { 
          userId: user.id, 
          companyId, 
          isDefault: true  // Sempre true, pois só há uma empresa por usuário
        }
      });

      const { password: _, ...rest } = user;
      return rest;
    });
  }

  /**
   * Busca por chave única (por exemplo, id) com qualquer seleção/include.
   */
  static async findUnique<T extends Prisma.UserFindUniqueArgs>(
    args: T
  ): Promise<Prisma.UserGetPayload<T> | null> {
    const result = await prisma.user.findUnique(args);
    return result as Prisma.UserGetPayload<T> | null;
  }

  /**
   * Busca o primeiro registro que satisfaz um filtro qualquer.
   */
  static async findFirst<T extends Prisma.UserFindFirstArgs>(
    args: T
  ): Promise<Prisma.UserGetPayload<T> | null> {
    const result = await prisma.user.findFirst(args);
    return result as Prisma.UserGetPayload<T> | null;
  }

  /**
   * Lista usuários com qualquer filtro/seleção.
   * Simplificado para considerar apenas usuários da empresa atual.
   */
  static async listUsers<T extends Prisma.UserFindManyArgs>(
    args: T,
    companyId?: number
  ): Promise<Prisma.UserGetPayload<T>[]> {
    let whereWithCompany = args.where || {};

    if (companyId !== undefined) {
      whereWithCompany = {
        ...whereWithCompany,
        companies: {
          some: { companyId }
        }
      };
    }

    const updatedArgs = {
      ...args,
      where: whereWithCompany
    };

    const users = await prisma.user.findMany(updatedArgs as any);
    return users as Prisma.UserGetPayload<T>[];
  }

  /**
   * Atualiza usuário; se enviar password, já faz o hash.
   * Retorna todos os campos de User, exceto password.
   */
  static async updateUser(
    id: number,
    data: Partial<Prisma.UserUpdateInput>
  ): Promise<Omit<User, 'password'>> {
    if (data.password) {
      data.password = await this.hashPassword(data.password as string);
    }
    const user = await prisma.user.update({
      where: { id },
      data
    });
    const { password: _, ...rest } = user;
    return rest;
  }

  /**
   * Exclui usuário pelo ID, removendo antes as associações para evitar violação de FK.
   */
  static async deleteUser(id: number): Promise<void> {
    // Remove associações na tabela UserCompany
    await prisma.userCompany.deleteMany({ where: { userId: id } });
    // Agora deleta o usuário
    await prisma.user.delete({ where: { id } });
  }

  /**
   * Verifica se o usuário pertence à empresa especificada
   */
  static async userBelongsToCompany(userId: number, companyId: number): Promise<boolean> {
    const association = await prisma.userCompany.findFirst({
      where: {
        userId,
        companyId
      }
    });
    return !!association;
  }
}