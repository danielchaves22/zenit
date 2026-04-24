import { Request, Response } from 'express';
import { TransactionType } from '@prisma/client';
import FixedTransactionService from '../services/fixed-transaction.service';
import UserFinancialAccountAccessService from '../services/user-financial-account-access.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number; role: string } {
  // @ts-ignore auth middleware adds req.user
  const { companyId, userId, role } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return { companyId, userId, role };
}

async function ensureTemplateAccountAccess(
  userId: number,
  role: string,
  companyId: number,
  template: { type: TransactionType; fromAccountId: number | null; toAccountId: number | null }
): Promise<void> {
  if (role === 'ADMIN' || role === 'SUPERUSER') {
    return;
  }

  if (template.type === TransactionType.EXPENSE && template.fromAccountId) {
    const hasAccess = await UserFinancialAccountAccessService.checkUserAccountAccess(
      userId,
      template.fromAccountId,
      role,
      companyId
    );

    if (!hasAccess) {
      throw new Error('Acesso negado a conta de origem da transacao fixa');
    }
  }

  if (template.type === TransactionType.INCOME && template.toAccountId) {
    const hasAccess = await UserFinancialAccountAccessService.checkUserAccountAccess(
      userId,
      template.toAccountId,
      role,
      companyId
    );

    if (!hasAccess) {
      throw new Error('Acesso negado a conta de destino da transacao fixa');
    }
  }
}

export async function createFixedTransaction(req: Request, res: Response) {
  try {
    const { companyId, userId } = getUserContext(req);

    const fixed = await FixedTransactionService.createFixedTransaction({
      ...req.body,
      companyId,
      createdBy: userId
    });

    return res.status(201).json(fixed);
  } catch (error: any) {
    logger.error('Erro ao criar transacao fixa', { error: error.message, stack: error.stack });
    return res.status(400).json({ error: error.message || 'Erro ao criar transacao fixa' });
  }
}

export async function listFixedTransactions(req: Request, res: Response) {
  try {
    const { companyId, role, userId } = getUserContext(req);
    const includeInactive = req.body.includeInactive as boolean;
    const type = req.body.type as TransactionType | undefined;

    const templates = await FixedTransactionService.listFixedTransactions({
      companyId,
      includeInactive,
      type
    });

    if (role === 'ADMIN' || role === 'SUPERUSER') {
      return res.status(200).json(templates);
    }

    const accessibleAccountIds = await UserFinancialAccountAccessService.getUserAccessibleAccounts(
      userId,
      role,
      companyId
    );

    const filtered = templates.filter((template) => {
      if (template.type === TransactionType.EXPENSE) {
        return !!template.fromAccountId && accessibleAccountIds.includes(template.fromAccountId);
      }

      if (template.type === TransactionType.INCOME) {
        return !!template.toAccountId && accessibleAccountIds.includes(template.toAccountId);
      }

      return false;
    });

    return res.status(200).json(filtered);
  } catch (error: any) {
    logger.error('Erro ao listar transacoes fixas', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Erro ao listar transacoes fixas' });
  }
}

export async function updateFixedTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const { companyId, userId, role } = getUserContext(req);

    const existing = await FixedTransactionService.getFixedTransactionById(id, companyId);
    if (!existing) {
      return res.status(404).json({ error: 'Transacao fixa nao encontrada' });
    }

    await ensureTemplateAccountAccess(userId, role, companyId, existing);

    if (req.body.fromAccountId || req.body.toAccountId || req.body.type) {
      const projectedType = (req.body.type ?? existing.type) as TransactionType;
      const projectedFrom = req.body.fromAccountId ?? existing.fromAccountId;
      const projectedTo = req.body.toAccountId ?? existing.toAccountId;
      await ensureTemplateAccountAccess(userId, role, companyId, {
        type: projectedType,
        fromAccountId: projectedFrom,
        toAccountId: projectedTo
      });
    }

    const updated = await FixedTransactionService.updateFixedTransactionVersioned(
      id,
      {
        ...req.body,
        endDate: req.body.endDate ? new Date(req.body.endDate) : req.body.endDate
      },
      companyId
    );

    return res.status(200).json(updated);
  } catch (error: any) {
    logger.error('Erro ao atualizar transacao fixa', { error: error.message, stack: error.stack });
    return res.status(400).json({ error: error.message || 'Erro ao atualizar transacao fixa' });
  }
}

export async function cancelFixedTransaction(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const { companyId, role, userId } = getUserContext(req);

    const existing = await FixedTransactionService.getFixedTransactionById(id, companyId);
    if (!existing) {
      return res.status(404).json({ error: 'Transacao fixa nao encontrada' });
    }

    await ensureTemplateAccountAccess(userId, role, companyId, existing);

    const canceled = await FixedTransactionService.cancelFixedTransaction(id, companyId);
    return res.status(200).json(canceled);
  } catch (error: any) {
    logger.error('Erro ao cancelar transacao fixa', { error: error.message, stack: error.stack });
    return res.status(400).json({ error: error.message || 'Erro ao cancelar transacao fixa' });
  }
}

export async function materializeFixedTransactionOccurrence(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const { companyId, userId, role } = getUserContext(req);
    const occurrenceDate = new Date(req.body.occurrenceDate);

    const template = await FixedTransactionService.getFixedTransactionById(id, companyId);
    if (!template) {
      return res.status(404).json({ error: 'Transacao fixa nao encontrada' });
    }

    await ensureTemplateAccountAccess(userId, role, companyId, template);

    const result = await FixedTransactionService.materializeOccurrence({
      templateId: id,
      companyId,
      userId,
      occurrenceDate
    });

    return res.status(result.created ? 201 : 200).json(result);
  } catch (error: any) {
    logger.error('Erro ao materializar ocorrencia de transacao fixa', { error: error.message, stack: error.stack });
    return res.status(400).json({ error: error.message || 'Erro ao materializar ocorrencia da transacao fixa' });
  }
}
