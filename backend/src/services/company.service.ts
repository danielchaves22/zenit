import { PrismaClient, Company, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export default class CompanyService {
  static async nextCode(): Promise<number> {
    const agg = await prisma.company.aggregate({
      _max: { code: true }
    });
    const max = agg._max.code ?? -1;
    return max + 1;
  }

  static async createCompany(data: {
    name: string;
    address?: string;
  }): Promise<Company> {
    const code = await this.nextCode();
    return prisma.company.create({
      data: { name: data.name, address: data.address, code }
    });
  }

  static async listCompanies(): Promise<Company[]> {
    return prisma.company.findMany({ orderBy: { code: 'asc' } });
  }

  static async updateCompany(
    id: number,
    data: Partial<Prisma.CompanyUpdateInput>
  ): Promise<Company> {
    return prisma.company.update({ where: { id }, data });
  }

  static async deleteCompany(id: number): Promise<void> {
    await prisma.company.delete({ where: { id } });
  }
}
