// backend/src/middlewares/financial-access.middleware.ts
import { Request, Response, NextFunction } from 'express';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import { logger } from '../utils/logger';

/**
 * Middleware para verificar se o usuário tem acesso a uma conta específica
 * Usado em rotas que operam em uma conta específica (ex: /accounts/:id)
 */
export function requireAccountAccess(accountIdParam: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = Number(req.params[accountIdParam]);
      
      if (isNaN(accountId)) {
        return res.status(400).json({ error: 'ID de conta inválido' });
      }

      // @ts-ignore - authMiddleware já preencheu req.user
      const { userId, role, companyId } = req.user;

      // Verificar se companyId existe
      if (!companyId) {
        return res.status(403).json({ error: 'Contexto de empresa não encontrado' });
      }

      const hasAccess = await UserFinancialAccountAccessService.checkUserAccountAccess(
        userId,
        accountId,
        role,
        companyId
      );

      if (!hasAccess) {
        logger.warn('Unauthorized account access attempt', {
          userId,
          accountId,
          role,
          companyId,
          ip: req.ip
        });
        
        return res.status(403).json({ 
          error: 'Acesso negado a esta conta financeira' 
        });
      }

      next();
    } catch (error) {
      logger.error('Error in financial access middleware', { error });
      return res.status(500).json({ 
        error: 'Erro interno ao verificar permissões' 
      });
    }
  };
}

/**
 * Middleware para verificar se o usuário tem acesso às contas envolvidas em uma transação
 * Usado em operações de transação que podem envolver fromAccountId e/ou toAccountId
 */
export function requireTransactionAccountAccess() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // @ts-ignore - authMiddleware já preencheu req.user
      const { userId, role, companyId } = req.user;
      
      if (!companyId) {
        return res.status(403).json({ error: 'Contexto de empresa não encontrado' });
      }
      
      const { fromAccountId, toAccountId } = req.body;
      
      // Se nem fromAccount nem toAccount foram fornecidos, pular verificação
      if (!fromAccountId && !toAccountId) {
        return next();
      }

      // Verificar acesso a fromAccount se fornecido
      if (fromAccountId) {
        const hasFromAccess = await UserFinancialAccountAccessService.checkUserAccountAccess(
          userId,
          fromAccountId,
          role,
          companyId
        );

        if (!hasFromAccess) {
          logger.warn('Unauthorized transaction - no access to source account', {
            userId,
            fromAccountId,
            role,
            companyId
          });
          
          return res.status(403).json({ 
            error: 'Acesso negado à conta de origem' 
          });
        }
      }

      // Verificar acesso a toAccount se fornecido
      if (toAccountId) {
        const hasToAccess = await UserFinancialAccountAccessService.checkUserAccountAccess(
          userId,
          toAccountId,
          role,
          companyId
        );

        if (!hasToAccess) {
          logger.warn('Unauthorized transaction - no access to destination account', {
            userId,
            toAccountId,
            role,
            companyId
          });
          
          return res.status(403).json({ 
            error: 'Acesso negado à conta de destino' 
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Error in transaction access middleware', { error });
      return res.status(500).json({ 
        error: 'Erro interno ao verificar permissões da transação' 
      });
    }
  };
}

/**
 * Middleware para filtrar automaticamente contas baseado nas permissões do usuário
 * Adiciona ao req um filtro que pode ser usado nos controllers
 */
export function addAccountAccessFilter() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // @ts-ignore - authMiddleware já preencheu req.user
      const { userId, role, companyId } = req.user;

      if (!companyId) {
        return res.status(403).json({ error: 'Contexto de empresa não encontrado' });
      }

      const accessibleAccountIds = await UserFinancialAccountAccessService.getUserAccessibleAccounts(
        userId,
        role,
        companyId
      );

      // Adicionar filtro ao request para uso nos controllers
      // @ts-ignore
      req.accessibleAccountIds = accessibleAccountIds;
      
      next();
    } catch (error) {
      logger.error('Error in account access filter middleware', { error });
      return res.status(500).json({ 
        error: 'Erro interno ao aplicar filtros de permissão' 
      });
    }
  };
}

/**
 * Helper para verificar se usuário pode gerenciar permissões
 * Apenas ADMIN e SUPERUSER podem gerenciar permissões
 */
export function requirePermissionManagement() {
  return (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore - authMiddleware já preencheu req.user
    const { role } = req.user;

    if (role !== 'ADMIN' && role !== 'SUPERUSER') {
      return res.status(403).json({ 
        error: 'Apenas ADMIN e SUPERUSER podem gerenciar permissões de acesso' 
      });
    }

    next();
  };
}