import { User } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';

export function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || !req.user.companyIds) {
    res.status(403).json({ error: 'Acesso não autorizado: empresa não definida' });
    return;
  }
  next();
}
