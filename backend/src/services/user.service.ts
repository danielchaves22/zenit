import { PrismaClient, Prisma, Role, User } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Parâmetros para criação de usuário.
 */
export interface CompanyRoleInput {
  companyId: number;
  role: Role;
  isDefault?: boolean;
  isCompanyOwner?: boolean;
  manageFinancialAccounts?: boolean;
  manageFinancialCategories?: boolean;
}

export interface CreateUserParams {
  email: string;
  password: string;
  name: string;
  companies: CompanyRoleInput[];
}

export default class UserService {
  private static ensureOwnerRoleCompatibility(companies: CompanyRoleInput[]): void {
    const invalidOwner = companies.find(
      (company) => company.isCompanyOwner && company.role !== Role.SUPERUSER
    );

    if (invalidOwner) {
      throw new Error('Company owner deve possuir role SUPERUSER.');
    }
  }

  private static async ensureCompanyKeepsAnotherOwner(
    tx: Prisma.TransactionClient,
    companyId: number,
    excludedUserId: number
  ): Promise<void> {
    const otherOwnerCount = await tx.userCompany.count({
      where: {
        companyId,
        isCompanyOwner: true,
        NOT: {
          userId: excludedUserId
        }
      }
    });

    if (otherOwnerCount === 0) {
      throw new Error('Nao e possivel remover o ultimo company owner da empresa.');
    }
  }

  private static async ensureCompanyOwnerIntegrityForReplacement(
    tx: Prisma.TransactionClient,
    userId: number,
    companies: CompanyRoleInput[]
  ): Promise<void> {
    this.ensureOwnerRoleCompatibility(companies);

    const nextMembershipByCompanyId = new Map(
      companies.map((company) => [company.companyId, company])
    );
    const existingOwnerMemberships = await tx.userCompany.findMany({
      where: {
        userId,
        isCompanyOwner: true
      },
      select: {
        companyId: true
      }
    });

    for (const membership of existingOwnerMemberships) {
      const nextMembership = nextMembershipByCompanyId.get(membership.companyId);
      const keepsOwnership = nextMembership?.isCompanyOwner === true;

      if (!keepsOwnership) {
        await this.ensureCompanyKeepsAnotherOwner(tx, membership.companyId, userId);
      }
    }
  }

  private static async ensureCompanyOwnerIntegrityForRoleChange(
    tx: Prisma.TransactionClient,
    userId: number,
    companyId: number,
    newRole: Role
  ): Promise<void> {
    if (newRole === Role.SUPERUSER) {
      return;
    }

    const membership = await tx.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId
        }
      },
      select: {
        isCompanyOwner: true
      }
    });

    if (membership?.isCompanyOwner) {
      await this.ensureCompanyKeepsAnotherOwner(tx, companyId, userId);
    }
  }

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
    const { email, password, name, companies } = params;
    if (!companies || companies.length === 0) {
      throw new Error('É necessário vincular o usuário a pelo menos uma empresa');
    }
    this.ensureOwnerRoleCompatibility(companies);
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
            data: {
              name,
              password: hashed,
              mustChangePassword: true
            }
          })
        : await tx.user.create({
            data: {
              email,
              password: hashed,
              name,
              mustChangePassword: true
            }
          });

      // Criar associações com as empresas fornecidas
      for (let i = 0; i < companies.length; i++) {
        const c = companies[i];
        await tx.userCompany.create({
          data: {
            userId: user.id,
            companyId: c.companyId,
            role: c.role,
            isDefault: c.isDefault ?? i === 0,
            isCompanyOwner: c.isCompanyOwner ?? false,
            manageFinancialAccounts: c.manageFinancialAccounts ?? false,
            manageFinancialCategories: c.manageFinancialCategories ?? false
          }
        });
      }

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
    data: Partial<Prisma.UserUpdateInput>,
    companyContext?: number | CompanyRoleInput[]
  ): Promise<Omit<User, 'password'>> {
    let newRole: Role | undefined = undefined;
    if (data.password) {
      data.password = await this.hashPassword(data.password as string);
    }
    if ((data as any).role) {
      newRole = (data as any).role as Role;
      delete (data as any).role;
    }
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data
      });

      if (Array.isArray(companyContext)) {
        await this.ensureCompanyOwnerIntegrityForReplacement(tx, id, companyContext);
        await tx.userCompany.deleteMany({ where: { userId: id } });
        for (let i = 0; i < companyContext.length; i++) {
          const c = companyContext[i];
          await tx.userCompany.create({
            data: {
              userId: id,
              companyId: c.companyId,
              role: c.role,
              isDefault: c.isDefault ?? i === 0,
              isCompanyOwner: c.isCompanyOwner ?? false,
              manageFinancialAccounts: c.manageFinancialAccounts ?? false,
              manageFinancialCategories: c.manageFinancialCategories ?? false
            }
          });
        }
      } else if (newRole && companyContext) {
        await this.ensureCompanyOwnerIntegrityForRoleChange(tx, id, companyContext, newRole);
        await tx.userCompany.update({
          where: {
            userId_companyId: { userId: id, companyId: companyContext }
          },
          data: {
            role: newRole,
            ...(newRole === Role.SUPERUSER ? {} : { isCompanyOwner: false })
          }
        });
      }

      const { password: _, ...rest } = user;
      return rest;
    });
  }

  /**
   * Exclui usuário pelo ID, removendo antes as associações para evitar violação de FK.
   */
  static async deleteUser(id: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const ownerMemberships = await tx.userCompany.findMany({
        where: {
          userId: id,
          isCompanyOwner: true
        },
        select: {
          companyId: true
        }
      });

      for (const membership of ownerMemberships) {
        await this.ensureCompanyKeepsAnotherOwner(tx, membership.companyId, id);
      }

      await tx.userCompany.deleteMany({ where: { userId: id } });
      await tx.user.delete({ where: { id } });
    });
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

  static async getUserCompanyContext(userId: number, companyId: number): Promise<{ role: Role; isCompanyOwner: boolean; manageFinancialAccounts: boolean; manageFinancialCategories: boolean } | null> {
    const association = await prisma.userCompany.findFirst({
      where: { userId, companyId }
    });
    if (!association) return null;
    return {
      role: association.role,
      isCompanyOwner: association.isCompanyOwner,
      manageFinancialAccounts: association.manageFinancialAccounts,
      manageFinancialCategories: association.manageFinancialCategories
    };
  }
}
