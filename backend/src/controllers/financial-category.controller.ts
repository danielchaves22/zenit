import { Request, Response } from 'express';
import { PrismaClient, TransactionType } from '@prisma/client';
import { ListCategoriesQuery } from '../validators/financial-category.validator';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

function getUserContext(req: Request): { companyId: number; userId: number } {
  // @ts-ignore - O middleware ja validou a existencia desses valores
  const { companyId, userId } = req.user;

  if (!companyId) {
    throw new Error('Contexto de empresa nao encontrado');
  }

  return { companyId, userId };
}

function getCategoryTypeLabel(type: TransactionType): string {
  switch (type) {
    case 'INCOME':
      return 'receita';
    case 'TRANSFER':
      return 'transferencia';
    case 'EXPENSE':
    default:
      return 'despesa';
  }
}

function ensureParentCompatibility(params: {
  parentCategory: { type: TransactionType };
  type: TransactionType;
}): string | null {
  if (params.parentCategory.type !== params.type) {
    return `Categoria pai deve ser do tipo ${getCategoryTypeLabel(params.type)}`;
  }

  return null;
}

export async function createCategory(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { name, type, color, icon, parentId, accountingCode } = req.body;

    if (parentId) {
      const parentCategory = await prisma.financialCategory.findUnique({
        where: { id: parentId }
      });

      if (!parentCategory) {
        return res.status(400).json({ error: 'Categoria pai nao encontrada' });
      }

      if (parentCategory.companyId !== companyId) {
        return res.status(403).json({ error: 'Categoria pai pertence a outra empresa' });
      }

      const parentCompatibilityError = ensureParentCompatibility({
        parentCategory,
        type
      });

      if (parentCompatibilityError) {
        return res.status(400).json({ error: parentCompatibilityError });
      }
    }

    const existingCategory = await prisma.financialCategory.findFirst({
      where: {
        name,
        parentId: parentId || null,
        companyId
      }
    });

    if (existingCategory) {
      return res.status(400).json({
        error: `Ja existe uma categoria '${name}' nesse nivel`
      });
    }

    const category = await prisma.financialCategory.create({
      data: {
        name,
        type,
        color,
        icon: icon || 'tag',
        ...(parentId && { parent: { connect: { id: parentId } } }),
        accountingCode: accountingCode || null,
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

export async function getCategories(req: Request, res: Response) {
  try {
    const { companyId } = getUserContext(req);
    const { type, parentId, search } = req.query as unknown as ListCategoriesQuery;

    const where: any = { companyId };

    if (type) {
      where.type = type;
    }

    if (parentId === null) {
      where.parentId = null;
    } else if (typeof parentId === 'number') {
      where.parentId = parentId;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

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

export async function getCategoryById(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const { companyId } = getUserContext(req);

    const category = await prisma.financialCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          select: { id: true, name: true, type: true, color: true, icon: true }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoria nao encontrada' });
    }

    if (category.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    return res.status(200).json(category);
  } catch (error) {
    logger.error('Erro ao buscar categoria financeira:', error);
    return res.status(500).json({
      error: 'Erro ao buscar categoria financeira'
    });
  }
}

export async function updateCategory(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const { companyId } = getUserContext(req);
    const { name, type, color, icon, parentId, accountingCode } = req.body;

    const existingCategory = await prisma.financialCategory.findUnique({
      where: { id }
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Categoria nao encontrada' });
    }

    if (existingCategory.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const nextType = type ?? existingCategory.type;
    const nextParentId = parentId !== undefined ? parentId : existingCategory.parentId;

    if (parentId) {
      if (nextParentId === id) {
        return res.status(400).json({
          error: 'Uma categoria nao pode ser sua propria categoria pai'
        });
      }

      let currentParentId = nextParentId;
      while (currentParentId) {
        const parent = await prisma.financialCategory.findUnique({
          where: { id: currentParentId },
          select: { id: true, parentId: true, companyId: true, type: true }
        });

        if (!parent) {
          return res.status(400).json({ error: 'Categoria pai nao encontrada' });
        }

        if (parent.companyId !== companyId) {
          return res.status(403).json({ error: 'Categoria pai pertence a outra empresa' });
        }

        if (parent.id === id) {
          return res.status(400).json({
            error: 'Essa relacao criaria um ciclo na hierarquia de categorias'
          });
        }

        if (parent.id === nextParentId) {
          const parentCompatibilityError = ensureParentCompatibility({
            parentCategory: parent,
            type: nextType
          });

          if (parentCompatibilityError) {
            return res.status(400).json({ error: parentCompatibilityError });
          }
        }

        currentParentId = parent.parentId;
      }
    }

    if (nextType !== existingCategory.type) {
      const incompatibleChildrenCount = await prisma.financialCategory.count({
        where: {
          parentId: id,
          type: { not: nextType }
        }
      });

      if (incompatibleChildrenCount > 0) {
        return res.status(400).json({
          error:
            'Nao e possivel alterar o tipo enquanto houver subcategorias com configuracao diferente'
        });
      }
    }

    if (name && name !== existingCategory.name) {
      const categoryWithSameName = await prisma.financialCategory.findFirst({
        where: {
          name,
          parentId: nextParentId,
          companyId,
          id: { not: id }
        }
      });

      if (categoryWithSameName) {
        return res.status(400).json({
          error: `Ja existe uma categoria '${name}' nesse nivel`
        });
      }
    }

    const updatedCategory = await prisma.financialCategory.update({
      where: { id },
      data: {
        name,
        type,
        color,
        icon,
        ...(parentId !== undefined && {
          parent: parentId ? { connect: { id: parentId } } : { disconnect: true }
        }),
        accountingCode: accountingCode === undefined ? existingCategory.accountingCode : accountingCode || null
      }
    });

    return res.status(200).json(updatedCategory);
  } catch (error) {
    logger.error('Erro ao atualizar categoria financeira:', error);
    return res.status(500).json({
      error: 'Erro ao atualizar categoria financeira'
    });
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    const { companyId } = getUserContext(req);

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
      return res.status(404).json({ error: 'Categoria nao encontrada' });
    }

    if (category.companyId !== companyId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (category._count.children > 0) {
      return res.status(400).json({
        error: 'Nao e possivel excluir uma categoria que possui subcategorias'
      });
    }

    if (category._count.transactions > 0) {
      return res.status(400).json({
        error: 'Nao e possivel excluir uma categoria que possui transacoes associadas'
      });
    }

    await prisma.financialCategory.delete({
      where: { id }
    });

    return res.status(204).send();
  } catch (error) {
    logger.error('Erro ao excluir categoria financeira:', error);
    return res.status(500).json({
      error: 'Erro ao excluir categoria financeira'
    });
  }
}
