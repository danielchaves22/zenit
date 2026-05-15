import { Request, Response } from 'express';
import BankService from '../services/bank.service';
import { logger } from '../utils/logger';

function getUserRole(req: Request) {
  // @ts-ignore auth middleware injects user
  return req.user?.role as string | undefined;
}

function ensureAdmin(req: Request) {
  const role = getUserRole(req);

  if (role !== 'ADMIN') {
    throw new Error('Acesso negado: apenas ADMIN pode gerenciar bancos.');
  }
}

function parseId(value: string) {
  const id = Number(value);

  if (Number.isNaN(id)) {
    throw new Error('ID invalido');
  }

  return id;
}

export async function listFinancialBanks(req: Request, res: Response) {
  try {
    const banks = await BankService.listActiveBanks();
    return res.status(200).json(banks);
  } catch (error: any) {
    logger.error('Erro ao listar bancos financeiros:', error);
    return res.status(500).json({
      error: error.message || 'Erro ao listar bancos'
    });
  }
}

export async function listAdminBanks(req: Request, res: Response) {
  try {
    ensureAdmin(req);
    const banks = await BankService.listAdminBanks();
    return res.status(200).json(banks);
  } catch (error: any) {
    logger.error('Erro ao listar bancos no admin:', error);
    return res.status(error.message?.includes('Acesso negado') ? 403 : 500).json({
      error: error.message || 'Erro ao listar bancos'
    });
  }
}

export async function getAdminBank(req: Request, res: Response) {
  try {
    ensureAdmin(req);
    const id = parseId(req.params.id);
    const bank = await BankService.getById(id);

    if (!bank) {
      return res.status(404).json({ error: 'Banco nao encontrado' });
    }

    return res.status(200).json(bank);
  } catch (error: any) {
    logger.error('Erro ao obter banco no admin:', error);
    return res.status(
      error.message === 'ID invalido'
        ? 400
        : error.message?.includes('Acesso negado')
          ? 403
          : 500
    ).json({
      error: error.message || 'Erro ao obter banco'
    });
  }
}

export async function listAdminBankIconOptions(req: Request, res: Response) {
  try {
    ensureAdmin(req);
    return res.status(200).json(BankService.listIconOptions());
  } catch (error: any) {
    logger.error('Erro ao listar icones de bancos no admin:', error);
    return res.status(error.message?.includes('Acesso negado') ? 403 : 500).json({
      error: error.message || 'Erro ao listar icones de bancos'
    });
  }
}

export async function createAdminBank(req: Request, res: Response) {
  try {
    ensureAdmin(req);
    const bank = await BankService.createBank(req.body);
    return res.status(201).json(bank);
  } catch (error: any) {
    logger.error('Erro ao criar banco no admin:', error);
    return res.status(
      error.message?.includes('Acesso negado')
        ? 403
        : error.message?.includes('invalido') || error.code === 'P2002'
          ? 400
          : 500
    ).json({
      error:
        error.code === 'P2002'
          ? 'Ja existe um banco com este codigo ou nome'
          : error.message || 'Erro ao criar banco'
    });
  }
}

export async function updateAdminBank(req: Request, res: Response) {
  try {
    ensureAdmin(req);
    const id = parseId(req.params.id);
    const bank = await BankService.updateBank(id, req.body);
    return res.status(200).json(bank);
  } catch (error: any) {
    logger.error('Erro ao atualizar banco no admin:', error);
    return res.status(
      error.message === 'ID invalido'
        ? 400
        : error.message?.includes('Acesso negado')
          ? 403
          : error.message?.includes('invalido') || error.code === 'P2002' || error.code === 'P2025'
            ? 400
            : 500
    ).json({
      error:
        error.code === 'P2002'
          ? 'Ja existe um banco com este codigo ou nome'
          : error.code === 'P2025'
            ? 'Banco nao encontrado'
            : error.message || 'Erro ao atualizar banco'
    });
  }
}

export async function deleteAdminBank(req: Request, res: Response) {
  try {
    ensureAdmin(req);
    const id = parseId(req.params.id);
    await BankService.deleteBank(id);
    return res.status(204).send();
  } catch (error: any) {
    logger.error('Erro ao excluir banco no admin:', error);
    return res.status(
      error.message === 'ID invalido'
        ? 400
        : error.message?.includes('Acesso negado')
          ? 403
          : error.message?.includes('Nao e possivel')
            ? 400
            : error.code === 'P2025'
              ? 404
              : 500
    ).json({
      error: error.code === 'P2025' ? 'Banco nao encontrado' : error.message || 'Erro ao excluir banco'
    });
  }
}
