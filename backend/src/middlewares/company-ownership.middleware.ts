import { NextFunction, Request, Response } from 'express';

export function requireCompanyOwnerOrAdmin(req: Request, res: Response, next: NextFunction) {
  // @ts-ignore - populated by auth + tenant middlewares
  const { role, isCompanyOwner } = req.user;

  if (role === 'ADMIN' || isCompanyOwner) {
    return next();
  }

  return res.status(403).json({
    error: 'Acesso negado: apenas ADMIN ou company owner podem executar esta acao.'
  });
}
