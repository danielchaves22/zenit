import { Request, Response } from 'express';
import MonthlyCategoryBudgetService from '../services/monthly-category-budget.service';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import { getWorkspacePlanningCapabilities } from '../policies/workspace-planning-access.policy';
import {
  CreateMonthlyCategoryBudgetBody,
  EndRecurringMonthlyCategoryBudgetBody,
  GetMonthlyCategoryBudgetQuery,
  ReplaceMonthlyCategoryBudgetBody
} from '../validators/monthly-category-budget.validator';

function getUserContext(req: Request): {
  companyId: number;
  userId: number;
  role: string;
} {
  // @ts-ignore - auth middleware injeta user
  const { companyId, userId, role } = req.user;

  if (!companyId || !userId || !role) {
    throw new Error('Contexto do usuário não encontrado');
  }

  return { companyId, userId, role };
}

async function resolveAccess(req: Request) {
  const { companyId, userId, role } = getUserContext(req);
  const hasCompanyWideAccess = role === 'ADMIN' || role === 'SUPERUSER';

  const [accessFilter, accessibleAccountIds] = await Promise.all([
    hasCompanyWideAccess
      ? Promise.resolve(undefined)
      : UserFinancialAccountAccessService.getAccessibleTransactionFilter(
          userId,
          role,
          companyId
        ),
    hasCompanyWideAccess
      ? Promise.resolve(undefined)
      : UserFinancialAccountAccessService.getUserAccessibleAccounts(userId, role, companyId)
  ]);

  return { companyId, userId, accessFilter, accessibleAccountIds };
}

function withPlanningAccess<T extends object>(req: Request, payload: T) {
  return {
    ...payload,
    access: getWorkspacePlanningCapabilities({
      role: req.user.role,
      isCompanyOwner: req.user.isCompanyOwner
    })
  };
}

export async function getMonthlyCategoryBudget(req: Request, res: Response) {
  try {
    const { month, planOnly } = req.query as unknown as GetMonthlyCategoryBudgetQuery;
    const context = await resolveAccess(req);
    const plan = await MonthlyCategoryBudgetService.getPlan({
      ...context,
      month,
      planOnly
    });

    return res.status(200).json(withPlanningAccess(req, plan));
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao carregar planejamento mensal'
    });
  }
}

export async function replaceMonthlyCategoryBudget(req: Request, res: Response) {
  try {
    const { month, allocations } = req.body as ReplaceMonthlyCategoryBudgetBody;
    const context = await resolveAccess(req);

    await MonthlyCategoryBudgetService.replacePlan({
      companyId: context.companyId,
      month,
      allocations
    });

    const plan = await MonthlyCategoryBudgetService.getPlan({
      ...context,
      month
    });

    return res.status(200).json(withPlanningAccess(req, plan));
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao salvar planejamento mensal'
    });
  }
}

export async function createMonthlyCategoryBudget(req: Request, res: Response) {
  try {
    const input = req.body as CreateMonthlyCategoryBudgetBody;
    const context = await resolveAccess(req);

    await MonthlyCategoryBudgetService.createPlanning({
      companyId: context.companyId,
      ...input
    });

    const plan = await MonthlyCategoryBudgetService.getPlan({
      ...context,
      month: input.month
    });

    return res.status(201).json(withPlanningAccess(req, plan));
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao criar planejamento mensal'
    });
  }
}

export async function endRecurringMonthlyCategoryBudget(req: Request, res: Response) {
  try {
    const recurringBudgetId = Number(req.params.id);
    if (!Number.isInteger(recurringBudgetId) || recurringBudgetId <= 0) {
      throw new Error('Planejamento fixo inválido');
    }

    const { month } = req.body as EndRecurringMonthlyCategoryBudgetBody;
    const context = await resolveAccess(req);

    await MonthlyCategoryBudgetService.endRecurringPlanning({
      companyId: context.companyId,
      recurringBudgetId,
      month
    });

    const plan = await MonthlyCategoryBudgetService.getPlan({
      ...context,
      month
    });

    return res.status(200).json(withPlanningAccess(req, plan));
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao encerrar planejamento fixo'
    });
  }
}
