import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { generateToken, generateRefreshToken, verifyToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import { resetLoginAttempts, recordFailedLogin } from '../middlewares/rate-limit.middleware';
import AppAccessService from '../services/app-access.service';
import { APP_HEADER, toPrismaAppKey, toHeaderAppKey } from '../constants/app-access';

const prisma = new PrismaClient();

function getClientIP(req: Request): string {
  return req.ip || req.connection.remoteAddress || 'unknown';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getErrorStack(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

async function buildAppAccessByCompany(userId: number, companyIds: number[]) {
  const accessByCompany: Record<
    number,
    { appKey: string; enabled: boolean; granted: boolean; allowed: boolean }[]
  > = {};

  await Promise.all(
    companyIds.map(async (companyId) => {
      accessByCompany[companyId] = await AppAccessService.getEffectiveAccess(userId, companyId);
    })
  );

  return accessByCompany;
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const clientIP = getClientIP(req);
  const appHeader = req.headers[APP_HEADER];
  const appHeaderValue = Array.isArray(appHeader) ? appHeader[0] : appHeader;
  const requestedApp = toPrismaAppKey(appHeaderValue);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha sao obrigatorios' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        companies: {
          include: {
            company: true
          }
        }
      }
    });

    if (!user) {
      logger.warn('Login attempt with non-existent email', {
        email: normalizedEmail,
        ip: clientIP
      });

      await recordFailedLogin(normalizedEmail, clientIP);
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      logger.warn('Login attempt with wrong password', {
        userId: user.id,
        email: normalizedEmail,
        ip: clientIP
      });

      await recordFailedLogin(normalizedEmail, clientIP);
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    await resetLoginAttempts(normalizedEmail, clientIP);

    const companies = user.companies.map((uc) => ({
      id: uc.companyId,
      name: uc.company.name,
      role: uc.role,
      isDefault: uc.isDefault,
      manageFinancialAccounts: uc.manageFinancialAccounts,
      manageFinancialCategories: uc.manageFinancialCategories
    }));

    const appAccessByCompany = await buildAppAccessByCompany(
      user.id,
      companies.map((company) => company.id)
    );

    if (requestedApp && companies.length > 0) {
      const requestedKey = toHeaderAppKey(requestedApp);
      const hasRequestedAccess = Object.values(appAccessByCompany).some((companyAccess) =>
        companyAccess.some((access) => access.appKey === requestedKey && access.allowed)
      );

      if (!hasRequestedAccess) {
        return res.status(403).json({
          error: 'Usuario sem acesso ao aplicativo solicitado.'
        });
      }
    }

    const tokenPayload = {
      userId: user.id
    };

    const token = generateToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    const preferences = await prisma.userPreference.findUnique({ where: { userId: user.id } });

    logger.info('User login successful', {
      userId: user.id,
      email: normalizedEmail,
      companies,
      ip: clientIP,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
        companies,
        appAccessByCompany
      },
      preferences: {
        colorScheme: preferences?.colorScheme || null
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

export async function refreshToken(req: Request, res: Response) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token e obrigatorio' });
  }

  try {
    const decoded = verifyToken(refreshToken);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true }
    });

    if (!user) {
      logger.warn('Refresh token used for invalid/inactive user', {
        userId: decoded.userId,
        ip: getClientIP(req)
      });

      return res.status(401).json({ error: 'Usuario invalido ou inativo' });
    }

    const newToken = generateToken({
      userId: user.id
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

    return res.status(401).json({ error: 'Refresh token invalido ou expirado' });
  }
}

export async function getCurrentUser(req: Request, res: Response) {
  try {
    const userId = req.user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        companies: {
          select: {
            role: true,
            isDefault: true,
            manageFinancialAccounts: true,
            manageFinancialCategories: true,
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

    const preferences = await prisma.userPreference.findUnique({ where: { userId } });

    if (!user) {
      return res.status(404).json({ error: 'Usuario nao encontrado' });
    }

    const companies = user.companies.map((uc) => ({
      id: uc.company.id,
      name: uc.company.name,
      role: uc.role,
      isDefault: uc.isDefault,
      manageFinancialAccounts: uc.manageFinancialAccounts,
      manageFinancialCategories: uc.manageFinancialCategories
    }));

    const appAccessByCompany = await buildAppAccessByCompany(
      user.id,
      companies.map((company) => company.id)
    );

    return res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        companies,
        appAccessByCompany
      },
      preferences: {
        colorScheme: preferences?.colorScheme || null
      }
    });
  } catch (error: unknown) {
    logger.error('Error fetching current user', {
      error: getErrorMessage(error),
      userId: req.user?.userId
    });

    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export async function validateToken(req: Request, res: Response) {
  return res.status(200).json({
    valid: true,
    expiresAt: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null
  });
}

export async function logout(req: Request, res: Response) {
  try {
    logger.info('User logout', {
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
