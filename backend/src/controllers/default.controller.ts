// backend/src/controllers/default.controller.ts
import { Request, Response } from 'express';
import DefaultService from '../services/default.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - O middleware já validou a existência desses valores
  const { companyId, userId } = req.user;
  
  if (!companyId) {
    throw new Error('Contexto de empresa não encontrado');
  }
  
  return { companyId, userId };
}

/**
 * POST /api/financial/accounts/:id/set-default
 */
export async function setDefaultAccount(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.id);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const { companyId } = getUserContext(req);
    
    await DefaultService.setDefaultAccount(accountId, companyId);
    
    return res.status(200).json({ 
      message: 'Conta definida como padrão com sucesso' 
    });
  } catch (error: any) {
    logger.error('Erro ao definir conta padrão:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao definir conta padrão'
    });
  }
}

/**
 * DELETE /api/financial/accounts/:id/set-default
 */
export async function unsetDefaultAccount(req: Request, res: Response) {
  try {
    const accountId = Number(req.params.id);
    if (isNaN(accountId)) {
      return res.status(400).json({ error: 'ID de conta inválido' });
    }

    const { companyId } = getUserContext(req);
    
    await DefaultService.unsetDefaultAccount(accountId, companyId);
    
    return res.status(200).json({ 
      message: 'Conta padrão removida com sucesso' 
    });
  } catch (error: any) {
    logger.error('Erro ao remover conta padrão:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao remover conta padrão'
    });
  }
}

/**
 * POST /api/financial/categories/:id/set-default
 */
export async function setDefaultCategory(req: Request, res: Response) {
  try {
    const categoryId = Number(req.params.id);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID de categoria inválido' });
    }

    const { companyId } = getUserContext(req);
    
    await DefaultService.setDefaultCategory(categoryId, companyId);
    
    return res.status(200).json({ 
      message: 'Categoria definida como padrão com sucesso' 
    });
  } catch (error: any) {
    logger.error('Erro ao definir categoria padrão:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao definir categoria padrão'
    });
  }
}

/**
 * DELETE /api/financial/categories/:id/set-default
 */
export async function unsetDefaultCategory(req: Request, res: Response) {
  try {
    const categoryId = Number(req.params.id);
    if (isNaN(categoryId)) {
      return res.status(400).json({ error: 'ID de categoria inválido' });
    }

    const { companyId } = getUserContext(req);
    
    await DefaultService.unsetDefaultCategory(categoryId, companyId);
    
    return res.status(200).json({ 
      message: 'Categoria padrão removida com sucesso' 
    });
  } catch (error: any) {
    logger.error('Erro ao remover categoria padrão:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao remover categoria padrão'
    });
  }
}

/**
 * GET /api/financial/defaults
 * Obtém todos os padrões da empresa (para auto-seleção em formulários)
 */
export async function getCompanyDefaults(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    
    const defaults = await DefaultService.getCompanyDefaults(companyId);
    
    return res.status(200).json(defaults);
  } catch (error: any) {
    logger.error('Erro ao obter padrões da empresa:', error);
    return res.status(500).json({
      error: 'Erro ao obter padrões da empresa'
    });
  }
}