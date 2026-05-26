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

type AuthCompanyView = {
  id: number;
  name: string;
  role: string;
  isDefault: boolean;
  isCompanyOwner: boolean;
  manageFinancialAccounts: boolean;
  manageFinancialCategories: boolean;
};

async function buildAuthPayload(
  userId: number,
  requestedAppHeader?: string | null
): Promise<{
  token: string;
  refreshToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    mustChangePassword: boolean;
    companies: AuthCompanyView[];
    appAccessByCompany: Record<
      number,
      { appKey: string; enabled: boolean; granted: boolean; allowed: boolean }[]
    >;
  };
  preferences: {
    colorScheme: string | null;
  };
}> {
  const requestedApp = toPrismaAppKey(requestedAppHeader);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      companies: {
        include: {
          company: true
        }
      }
    }
  });

  if (!user) {
    throw new Error('Usuario nao encontrado');
  }

  const companies = user.companies.map((uc) => ({
    id: uc.companyId,
    name: uc.company.name,
    role: uc.role,
    isDefault: uc.isDefault,
    isCompanyOwner: uc.isCompanyOwner,
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
      throw new Error('Usuario sem acesso ao aplicativo solicitado.');
    }
  }

  const preferences = await prisma.userPreference.findUnique({ where: { userId: user.id } });

  return {
    token: generateToken({ userId: user.id }),
    refreshToken: generateRefreshToken({ userId: user.id }),
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
    }
  };
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const clientIP = getClientIP(req);
  const appHeader = req.headers[APP_HEADER];
  const appHeaderValue = Array.isArray(appHeader) ? appHeader[0] : appHeader;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha sao obrigatorios' });
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        password: true
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

    const authPayload = await buildAuthPayload(user.id, appHeaderValue);

    logger.info('User login successful', {
      userId: user.id,
      email: normalizedEmail,
      ip: clientIP,
      userAgent: req.get('User-Agent')
    });

    return res.status(200).json({
      ...authPayload,
      message: 'Login realizado com sucesso'
    });
  } catch (error: unknown) {
    if (getErrorMessage(error) === 'Usuario sem acesso ao aplicativo solicitado.') {
      return res.status(403).json({
        error: 'Usuario sem acesso ao aplicativo solicitado.'
      });
    }
 
    logger.error('Login internal error', {
      error: getErrorMessage(error),
      stack: getErrorStack(error),
      email: normalizedEmail,
      ip: clientIP
    });

    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export async function register(req: Request, res: Response) {
  const { email, password, name } = req.body;
  const clientIP = getClientIP(req);
  const appHeader = req.headers[APP_HEADER];
  const appHeaderValue = Array.isArray(appHeader) ? appHeader[0] : appHeader;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Nome, email e senha sao obrigatorios' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedName = String(name).trim();

  try {
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true }
    });

    if (existingUser) {
      return res.status(409).json({
        code: 'EMAIL_ALREADY_EXISTS',
        error: 'Conta ja existente. Faca login.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: passwordHash,
        name: normalizedName,
        role: 'USER',
        mustChangePassword: false
      },
      select: {
        id: true
      }
    });

    const authPayload = await buildAuthPayload(user.id, appHeaderValue);

    logger.info('User self-signup successful', {
      userId: user.id,
      email: normalizedEmail,
      ip: clientIP,
      userAgent: req.get('User-Agent')
    });

    return res.status(201).json({
      ...authPayload,
      message: 'Cadastro realizado com sucesso'
    });
  } catch (error: unknown) {
    logger.error('Register internal error', {
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
    const authPayload = await buildAuthPayload(userId);

    return res.status(200).json({
      user: authPayload.user,
      preferences: authPayload.preferences
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
