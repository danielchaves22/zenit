import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Função helper simplificada: extrai o único companyId do token
 */
function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - O middleware já validou a existência desses valores
  const { companyId, userId } = req.user;
  
  if (!companyId) {
    throw new Error('Contexto de empresa não encontrado');
  }
  
  return { companyId, userId };
}

/**
 * POST /api/financial/categories
 * Cria uma nova categoria financeira
 */
export async function createCategory(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { name, type, color, parentId, accountingCode } = req.body;

    // Se parentId for fornecido, verificar se existe e pertence à mesma empresa
    if (parentId) {
      const parentCategory = await prisma.financialCategory.findUnique({
        where: { id: parentId }
      });

      if (!parentCategory) {
        return res.status(400).json({ error: 'Categoria pai não encontrada' });
      }

      if (parentCategory.companyId !== companyId) {
        return res.status(403).json({ error: 'Categoria pai pertence a outra empresa' });
      }
    }

    // Verificar se já existe categoria com mesmo nome no mesmo nível
    const existingCategory = await prisma.financialCategory.findFirst({
      where: {
        name,
        parentId: parentId || null,
        companyId
      }
    });

    if (existingCategory) {
      return res.status(400).json({ 
        error: `Já existe uma categoria '${name}' nesse nível` 
      });
    }

    // Criar a categoria
    const category = await prisma.financialCategory.create({
      data: {
        name,
        type,
        color,
        parentId,
        accountingCode,
        company: { connect: { id: companyId } }
      }
    });

    return res.status(201).json(category);
  } catch (error) {
    logger.error('Erro ao criar categoria financeira:', error);
    return res.status(500).json({
      error: 'Erro ao criar categoria financeira'
    });
  }
}

/**
 * GET /api/financial/categories
 * Lista categorias financeiras com suporte a filtros
 */
export async function getCategories(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { type, parentId, search } = req.query;

    // Constrói os filtros
    const where: any = { companyId };
    
    if (type) {
      where.type = type;
    }
    
    // Filtra por categorias raiz (sem pai) ou por um pai específico
    if (parentId === 'null') {
      where.parentId = null;
    } else if (parentId) {
      where.parentId = Number(parentId);
    }
    
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // Busca categorias com informações de pai e filhos
    const categories = await prisma.financialCategory.findMany({
      where,
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { children: true } }
      },
      orderBy: { name: 'asc' }
    });

    return res.status(200).json(categories);
  } catch (error) {
    logger.error('Erro ao listar categorias financeiras:', error);
    return res.status(500).json({
      error: 'Erro ao listar categorias financeiras'
    });
  }
}

/**
 * GET /api/financial/categories/:id
 * Obtém uma categoria financeira específica pelo ID
 */
export async function getCategoryById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);

    const category = await prisma.financialCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          select: { id: true, name: true, type: true, color: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    // Verificar se pertence à empresa do usuário
    if (category.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.status(200).json(category);
  } catch (error) {
    logger.error(`Erro ao buscar categoria financeira:`, error);
    return res.status(500).json({
      error: 'Erro ao buscar categoria financeira'
    });
  }
}

/**
 * PUT /api/financial/categories/:id
 * Atualiza uma categoria financeira
 */
export async function updateCategory(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);
    const { name, type, color, parentId, accountingCode } = req.body;

    // Verificar se a categoria existe e pertence à empresa
    const existingCategory = await prisma.financialCategory.findUnique({
      where: { id }
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    if (existingCategory.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Evitar ciclos: uma categoria não pode ser sua própria descendente
    if (parentId) {
      // Verificar se o parentId não é a própria categoria
      if (parentId === id) {
        return res.status(400).json({ 
          error: 'Uma categoria não pode ser sua própria categoria pai' 
        });
      }

      // Verificar recursivamente para evitar ciclos na hierarquia
      let currentParentId = parentId;
      while (currentParentId) {
        const parent = await prisma.financialCategory.findUnique({
          where: { id: currentParentId },
          select: { id: true, parentId: true }
        });

        if (!parent) break;
        
        if (parent.id === id) {
          return res.status(400).json({ 
            error: 'Essa relação criaria um ciclo na hierarquia de categorias' 
          });
        }

        currentParentId = parent.parentId;
      }
    }

    // Verificar unicidade do nome no mesmo nível
    if (name && name !== existingCategory.name) {
      const categoryWithSameName = await prisma.financialCategory.findFirst({
        where: {
          name,
          parentId: parentId !== undefined ? parentId : existingCategory.parentId,
          companyId,
          id: { not: id } // excluir a própria categoria da verificação
        }
      });

      if (categoryWithSameName) {
        return res.status(400).json({ 
          error: `Já existe uma categoria '${name}' nesse nível` 
        });
      }
    }

    // Atualizar a categoria
    const updatedCategory = await prisma.financialCategory.update({
      where: { id },
      data: {
        name,
        type,
        color,
        parentId,
        accountingCode
      }
    });

    return res.status(200).json(updatedCategory);
  } catch (error) {
    logger.error(`Erro ao atualizar categoria financeira:`, error);
    return res.status(500).json({
      error: 'Erro ao atualizar categoria financeira'
    });
  }
}

/**
 * DELETE /api/financial/categories/:id
 * Exclui uma categoria financeira se não tiver transações ou subcategorias
 */
export async function deleteCategory(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { companyId } = getUserContext(req);

    // Verificar se a categoria existe e pertence à empresa
    const category = await prisma.financialCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            children: true,
            transactions: true
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoria não encontrada' });
    }

    if (category.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // Verificar se possui subcategorias
    if (category._count.children > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir uma categoria que possui subcategorias' 
      });
    }

    // Verificar se possui transações associadas
    if (category._count.transactions > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir uma categoria que possui transações associadas' 
      });
    }

    // Excluir a categoria
    await prisma.financialCategory.delete({
      where: { id }
    });

    return res.status(204).send();
  } catch (error) {
    logger.error(`Erro ao excluir categoria financeira:`, error);
    return res.status(500).json({
      error: 'Erro ao excluir categoria financeira'
    });
  }
}