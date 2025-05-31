// backend/src/controllers/company.controller.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import CompanyService from '../services/company.service';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Extrai do token o role do usuário autenticado.
 */
function getUserContext(req: Request): { role: string } {
  // @ts-ignore — preenchido pelo authMiddleware
  return { role: req.user.role as string };
}

/**
 * POST /api/companies
 * Cria empresa com estrutura financeira básica
 */
export const createCompany = async (req: Request, res: Response) => {
  const { role } = getUserContext(req);
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado: apenas ADMIN pode criar empresas.' });
  }

  const { name, address, createFinancialStructure = true } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'O campo name é obrigatório.' });
  }

  try {
    const result = await CompanyService.createCompany({ 
      name, 
      address, 
      createFinancialStructure 
    });
    
    const response = {
      ...result.company,
      financialStructure: result.financialStructure ? {
        account: {
          id: result.financialStructure.account.id,
          name: result.financialStructure.account.name,
          type: result.financialStructure.account.type,
          isDefault: result.financialStructure.account.isDefault
        },
        categories: {
          expense: {
            id: result.financialStructure.expenseCategory.id,
            name: result.financialStructure.expenseCategory.name,
            type: result.financialStructure.expenseCategory.type,
            color: result.financialStructure.expenseCategory.color,
            isDefault: result.financialStructure.expenseCategory.isDefault
          },
          income: {
            id: result.financialStructure.incomeCategory.id,
            name: result.financialStructure.incomeCategory.name,
            type: result.financialStructure.incomeCategory.type,
            color: result.financialStructure.incomeCategory.color,
            isDefault: result.financialStructure.incomeCategory.isDefault
          }
        },
        created: !!result.financialStructure
      } : null
    };

    return res.status(201).json(response);
  } catch (error: any) {
    logger.error('Erro ao criar empresa:', error);
    return res.status(500).json({ error: 'Erro interno ao criar empresa.' });
  }
};

/**
 * POST /api/companies/:id/financial-structure
 * Cria estrutura financeira para empresa existente que não possui
 */
export const createFinancialStructure = async (req: Request, res: Response) => {
  const { role } = getUserContext(req);
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado: apenas ADMIN pode criar estrutura financeira.' });
  }

  const companyId = Number(req.params.id);
  if (isNaN(companyId)) {
    return res.status(400).json({ error: 'ID de empresa inválido.' });
  }

  try {
    const result = await CompanyService.createFinancialStructureForExistingCompany(companyId);
    
    if (!result.created) {
      return res.status(400).json({ 
        error: 'Empresa já possui estrutura financeira criada.' 
      });
    }

    const response = {
      message: 'Estrutura financeira criada com sucesso',
      financialStructure: {
        account: {
          id: result.structure!.account.id,
          name: result.structure!.account.name,
          type: result.structure!.account.type,
          isDefault: result.structure!.account.isDefault
        },
        categories: {
          expense: {
            id: result.structure!.expenseCategory.id,
            name: result.structure!.expenseCategory.name,
            type: result.structure!.expenseCategory.type,
            color: result.structure!.expenseCategory.color,
            isDefault: result.structure!.expenseCategory.isDefault
          },
          income: {
            id: result.structure!.incomeCategory.id,
            name: result.structure!.incomeCategory.name,
            type: result.structure!.incomeCategory.type,
            color: result.structure!.incomeCategory.color,
            isDefault: result.structure!.incomeCategory.isDefault
          }
        }
      }
    };

    return res.status(201).json(response);
  } catch (error: any) {
    logger.error('Erro ao criar estrutura financeira:', error);
    return res.status(error.message.includes('not found') ? 404 : 500).json({
      error: error.message || 'Erro interno ao criar estrutura financeira.'
    });
  }
};

/**
 * GET /api/companies
 */
export const listCompanies = async (req: Request, res: Response) => {
  const { role } = getUserContext(req);
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado: apenas ADMIN pode listar empresas.' });
  }

  try {
    const companies = await CompanyService.listCompanies();
    return res.status(200).json(companies);
  } catch (error) {
    logger.error('Erro ao listar empresas:', error);
    return res.status(500).json({ error: 'Erro interno ao listar empresas.' });
  }
};

/**
 * PUT /api/companies/:id
 */
export const updateCompany = async (req: Request, res: Response) => {
  const { role } = getUserContext(req);
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado: apenas ADMIN pode editar empresas.' });
  }

  const id = Number(req.params.id);
  const { name, address } = req.body;
  if (isNaN(id) || (name === undefined && address === undefined)) {
    return res.status(400).json({ error: 'ID inválido ou nenhum campo para atualizar.' });
  }

  try {
    const company = await CompanyService.updateCompany(id, { name, address });
    return res.status(200).json(company);
  } catch (error) {
    logger.error(`Erro ao atualizar empresa ${id}:`, error);
    return res.status(500).json({ error: 'Erro interno ao atualizar empresa.' });
  }
};

/**
 * DELETE /api/companies/:id
 */
export const deleteCompany = async (req: Request, res: Response) => {
  const { role } = getUserContext(req);
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado: apenas ADMIN pode excluir empresas.' });
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'ID de empresa inválido.' });
  }

  try {
    await CompanyService.deleteCompany(id);
    return res.status(204).send();
  } catch (error: any) {
    logger.error(`Erro ao excluir empresa ${id}:`, error);
    return res.status(error.message.includes('Cannot delete') ? 400 : 500).json({
      error: error.message || 'Erro interno ao excluir empresa.'
    });
  }
};