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
   * Retorna todos os campos do User, exceto password.
   */
  static async createUser(params: CreateUserParams): Promise<Omit<User, 'password'>> {
    const { email, password, name, role, companyId } = params;
    const hashed = await this.hashPassword(password);

    const user = await prisma.user.create({
      data: { email, password: hashed, name, role }
    });

    await prisma.userCompany.create({
      data: { userId: user.id, companyId, isDefault: true }
    });

    const { password: _, ...rest } = user;
    return rest;
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
   * Lista muitos usuários com qualquer filtro/seleção.
   */
  static async listUsers<T extends Prisma.UserFindManyArgs>(
    args: T
  ): Promise<Prisma.UserGetPayload<T>[]> {
    const users = await prisma.user.findMany(args);
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
}
