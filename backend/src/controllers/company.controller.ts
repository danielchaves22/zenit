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
 */
export const createCompany = async (req: Request, res: Response) => {
  const { role } = getUserContext(req);
  if (role !== 'ADMIN') {
    return res.status(403).json({ error: 'Acesso negado: apenas ADMIN pode criar empresas.' });
  }

  const { name, address } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'O campo name é obrigatório.' });
  }

  try {
    const company = await CompanyService.createCompany({ name, address });
    return res.status(201).json(company);
  } catch (error) {
    logger.error('Erro ao criar empresa:', error);
    return res.status(500).json({ error: 'Erro interno ao criar empresa.' });
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
  } catch (error) {
    logger.error(`Erro ao excluir empresa ${id}:`, error);
    return res.status(500).json({ error: 'Erro interno ao excluir empresa.' });
  }
};
