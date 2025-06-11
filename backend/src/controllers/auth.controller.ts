// backend/src/controllers/auth.controller.ts - TIPAGEM CORRIGIDA

import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { generateToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { resetLoginAttempts, recordFailedLogin } from '../middlewares/rate-limit.middleware';

const prisma = new PrismaClient();

/**
 * Helper para extrair IP de forma segura
 */
function getClientIP(req: Request): string {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

/**
 * Helper para tratar erros de forma type-safe
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Helper para extrair stack trace de forma segura
 */
function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

/**
 * POST /api/auth/login - Login com proteção contra brute force
 */
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const clientIP = getClientIP(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Buscar usuário com dados necessários
    const user = await prisma.user.findUnique({ 
      where: { email: normalizedEmail },
      include: {
        companies: {
          take: 1,
          include: {
            company: true
          }
        }
      }
    });

    if (!user) {
      // Log tentativa com email inexistente
      logger.warn('Login attempt with non-existent email', { 
        email: normalizedEmail, 
        ip: clientIP 
      });
      
      await recordFailedLogin(normalizedEmail, clientIP);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Verificar senha
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      logger.warn('Login attempt with wrong password', { 
        userId: user.id, 
        email: normalizedEmail, 
        ip: clientIP 
      });
      
      await recordFailedLogin(normalizedEmail, clientIP);
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Verificar se usuário tem empresa
    if (!user.companies || user.companies.length === 0) {
      logger.error('User without company tried to login', { 
        userId: user.id, 
        email: normalizedEmail 
      });
      
      return res.status(403).json({ 
        error: 'Usuário não possui empresa associada. Contate o administrador.' 
      });
    }

    // Login bem-sucedido - resetar contadores
    await resetLoginAttempts(normalizedEmail, clientIP);

    // Dados da empresa
    const userCompany = user.companies[0];
    const companyId = userCompany.companyId;
    const companyName = userCompany.company.name;

    // Gerar tokens
    const tokenPayload = {
      userId: user.id,
      role: user.role
    };
    
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Log de login bem-sucedido
    logger.info('User login successful', {
      userId: user.id,
      email: normalizedEmail,
      companyId,
      ip: clientIP,
      userAgent: req.get('User-Agent')
    });

    // Resposta segura (sem senha)
    return res.status(200).json({ 
      token, 
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        manageFinancialAccounts: user.manageFinancialAccounts,
        manageFinancialCategories: user.manageFinancialCategories,
        mustChangePassword: user.mustChangePassword,
        company: {
          id: companyId,
          name: companyName
        }
      },
      message: 'Login realizado com sucesso'
    });

  } catch (error: unknown) {
    logger.error('Login internal error', { 
      error: getErrorMessage(error), 
      stack: getErrorStack(error),
      email: normalizedEmail,
      ip: clientIP
    });
    
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

/**
 * POST /api/auth/refresh - Renovar token
 */
export async function refreshToken(req: Request, res: Response) {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token é obrigatório' });
  }

  try {
    // Verificar refresh token
    const decoded = verifyToken(refreshToken);
    
    // Verificar se usuário ainda existe e está ativo
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        companies: {
          take: 1,
          include: { company: true }
        }
      }
    });

    if (!user || !user.companies || user.companies.length === 0) {
      logger.warn('Refresh token used for invalid/inactive user', { 
        userId: decoded.userId,
        ip: getClientIP(req)
      });
      
      return res.status(401).json({ error: 'Usuário inválido ou inativo' });
    }

    // Gerar novo access token
    const newToken = generateToken({
      userId: user.id,
      role: user.role
    });
    
    logger.info('Token refreshed successfully', {
      userId: user.id,
      ip: getClientIP(req)
    });
    
    return res.status(200).json({ token: newToken });
    
  } catch (error: unknown) {
    logger.warn('Invalid refresh token used', { 
      error: getErrorMessage(error),
      ip: getClientIP(req)
    });
    
    return res.status(401).json({ error: 'Refresh token inválido ou expirado' });
  }
}

/**
 * GET /api/auth/me - Obter dados do usuário logado
 */
export async function getCurrentUser(req: Request, res: Response) {
  try {
    // @ts-ignore - middleware já preencheu req.user
    const userId = req.user.userId;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        manageFinancialAccounts: true,
        manageFinancialCategories: true,
        companies: {
          take: 1,
          select: {
            company: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const company = user.companies[0]?.company;

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        manageFinancialAccounts: user.manageFinancialAccounts,
        manageFinancialCategories: user.manageFinancialCategories,
        company: company ? {
          id: company.id,
          name: company.name
        } : null
      }
    });

  } catch (error: unknown) {
    logger.error('Error fetching current user', { 
      error: getErrorMessage(error),
      // @ts-ignore
      userId: req.user?.userId
    });
    
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

/**
 * GET /api/auth/validate - Validar token atual
 */
export async function validateToken(req: Request, res: Response) {
  // Se chegou aqui, o middleware de auth já validou o token
  return res.status(200).json({ 
    valid: true,
    // @ts-ignore
    expiresAt: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null
  });
}

/**
 * POST /api/auth/logout - Logout (invalidar token)
 */
export async function logout(req: Request, res: Response) {
  try {
    // Em uma implementação mais robusta, você manteria uma blacklist de tokens
    // Por enquanto, apenas log do logout
    logger.info('User logout', {
      // @ts-ignore
      userId: req.user?.userId,
      ip: getClientIP(req)
    });

    return res.status(200).json({ message: 'Logout realizado com sucesso' });
    
  } catch (error: unknown) {
    logger.error('Logout error', { 
      error: getErrorMessage(error) 
    });
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}