import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { generateToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

/**
 * Registro desabilitado via API pública.
 */
export async function register(req: Request, res: Response) {
  return res
    .status(403)
    .json({ error: 'Registro de usuários desabilitado. Use POST /api/users com permissão adequada.' });
}

/**
 * POST /api/auth/login
 * Login simplificado: um usuário pertence a apenas uma empresa
 */
export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password são obrigatórios.' });
  }

  try {
    // Busca o usuário pelo email
    const user = await prisma.user.findUnique({ 
      where: { email },
      include: {
        companies: {
          take: 1,  // Pega apenas uma associação, já que agora temos apenas uma por usuário
          include: {
            company: true
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Verifica a senha
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    // Verifica se o usuário tem uma empresa associada
    if (!user.companies || user.companies.length === 0) {
      return res.status(401).json({ 
        error: 'Usuário não possui empresa associada. Contate o administrador.'
      });
    }

    // Pega a primeira (e única) empresa do usuário
    const userCompany = user.companies[0];
    const companyId = userCompany.companyId;
    const companyName = userCompany.company.name;

    // Gera tokens
    // @ts-ignore
    const role = user.role;
    const tokenPayload = { userId: user.id, companyId, role };
    
    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    return res.status(200).json({ 
      token, 
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        company: {
          id: companyId,
          name: companyName
        }
      },
      message: 'Login realizado com sucesso!' 
    });
  } catch (error) {
    logger.error('Erro no login:', error);
    return res.status(500).json({ error: 'Erro interno ao realizar login.' });
  }
}

/**
 * POST /api/auth/refresh
 * Gera um novo token de acesso usando o refresh token
 */
export async function refreshToken(req: Request, res: Response) {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token é obrigatório.' });
  }

  try {
    // Verifica refresh token
    const decoded = verifyToken(refreshToken);
    
    // Gera novo access token
    const token = generateToken({ 
      userId: decoded.userId, 
      companyId: decoded.companyId, 
      role: decoded.role 
    });
    
    return res.status(200).json({ token });
  } catch (error) {
    return res.status(401).json({ error: 'Refresh token inválido ou expirado.' });
  }
}