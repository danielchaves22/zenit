import { Request, Response, NextFunction } from 'express';

export type FeaturePermission = 'FINANCIAL_ACCOUNTS' | 'FINANCIAL_CATEGORIES';

export function requireFeaturePermission(permission: FeaturePermission) {
  return (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore - auth middleware acrescenta
    const { role, manageFinancialAccounts, manageFinancialCategories } = req.user;

    if (role === 'ADMIN' || role === 'SUPERUSER') {
      return next();
    }

    if (permission === 'FINANCIAL_ACCOUNTS' && manageFinancialAccounts) {
      return next();
    }

    if (permission === 'FINANCIAL_CATEGORIES' && manageFinancialCategories) {
      return next();
    }

    return res.status(403).json({ error: 'Acesso negado' });
  };
}
