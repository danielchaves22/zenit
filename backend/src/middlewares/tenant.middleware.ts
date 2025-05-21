import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para garantir que a requisição tem uma empresa definida
 * Versão simplificada: verifica apenas que há um companyId no token
 */
export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || !req.user.companyId) {
    res.status(403).json({ error: 'Acesso não autorizado: empresa não definida' });
    return;
  }
  next();
}