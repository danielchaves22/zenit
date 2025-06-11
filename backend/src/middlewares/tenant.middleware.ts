import { Request, Response, NextFunction } from 'express';
import UserService from '../services/user.service';

/**
 * Middleware para garantir que a requisição tem uma empresa definida
 * Versão simplificada: verifica apenas que há um companyId no token
 */
export async function tenantMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers['x-company-id'];
    const companyId = header ? parseInt(Array.isArray(header) ? header[0] : header) : NaN;

  if (!header || isNaN(companyId)) {
    res.status(403).json({ error: 'Empresa não informada ou inválida' });
    return;
  }

  if (!req.user || !req.user.userId) {
    res.status(403).json({ error: 'Usuário não autenticado' });
    return;
  }

    const belongs = await UserService.userBelongsToCompany(req.user.userId, companyId);
    if (!belongs) {
      res.status(403).json({ error: 'Acesso não autorizado à empresa' });
      return;
    }

    req.user.companyId = companyId;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao validar empresa' });
  }
}