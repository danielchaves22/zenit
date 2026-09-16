import prisma from '../lib/prisma';
import {
  buildFinancialCalendarContext,
  FinancialCalendarContext
} from '../utils/financial-calendar';

export default class WorkspaceFinancialCalendarService {
  static async getContext(
    companyId: number,
    at: Date = new Date()
  ): Promise<FinancialCalendarContext> {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { timeZone: true }
    });

    if (!company) {
      throw new Error('Empresa não encontrada');
    }

    return buildFinancialCalendarContext(company.timeZone, at);
  }
}
