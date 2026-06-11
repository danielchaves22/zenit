import { Request, Response } from 'express';
import FinancialDashboardService from '../services/financial-dashboard.service';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import {
  GetFinancialDashboardHistoryQuery,
  GetFinancialDashboardMonthlyQuery
} from '../validators/financial-dashboard.validator';

function getDashboardUserContext(req: Request): {
  companyId: number;
  userId: number;
  role: string;
} {
  // @ts-ignore - auth middleware injeta user
  const { companyId, userId, role } = req.user;

  if (!companyId || !userId || !role) {
    throw new Error('Contexto do usuario nao encontrado');
  }

  return { companyId, userId, role };
}

async function resolveDashboardAccess(req: Request) {
  const { companyId, userId, role } = getDashboardUserContext(req);

  const accessFilter =
    role === 'ADMIN' || role === 'SUPERUSER'
      ? undefined
      : await UserFinancialAccountAccessService.getAccessibleTransactionFilter(
          userId,
          role,
          companyId
        );

  const accessibleAccountIds =
    role === 'ADMIN' || role === 'SUPERUSER'
      ? undefined
      : await UserFinancialAccountAccessService.getUserAccessibleAccounts(userId, role, companyId);

  return {
    companyId,
    userId,
    role,
    accessFilter,
    accessibleAccountIds
  };
}

export async function getFinancialDashboardMonthly(req: Request, res: Response) {
  try {
    const { month } = req.query as unknown as GetFinancialDashboardMonthlyQuery;
    const { companyId, userId, accessFilter, accessibleAccountIds } =
      await resolveDashboardAccess(req);

    const dashboard = await FinancialDashboardService.getMonthlyDashboard({
      companyId,
      userId,
      month,
      accessFilter,
      accessibleAccountIds
    });

    return res.status(200).json(dashboard);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao carregar dashboard financeiro mensal'
    });
  }
}

export async function getFinancialDashboardHistory(req: Request, res: Response) {
  try {
    const { months, categoryIds } = req.query as unknown as GetFinancialDashboardHistoryQuery;
    const { companyId, accessFilter } = await resolveDashboardAccess(req);

    const dashboard = await FinancialDashboardService.getHistoryDashboard({
      companyId,
      months,
      categoryIds,
      accessFilter
    });

    return res.status(200).json(dashboard);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao carregar historico financeiro'
    });
  }
}
