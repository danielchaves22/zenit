import { NextFunction, Request, Response } from 'express';
import { AppKey, Role } from '@prisma/client';
import prisma from '../lib/prisma';
import { APP_HEADER, toPrismaAppKey } from '../constants/app-access';

/** Admin operates on the platform. Company context is explicit only for scoped settings. */
export async function platformAdminMiddleware(req: Request, res: Response, next: NextFunction) {
  delete req.user.platformAdmin;
  if (toPrismaAppKey(req.get(APP_HEADER)) !== AppKey.ZENIT_ADMIN) return next();

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId }, select: { role: true }
    });
    if (user?.role !== Role.ADMIN) {
      return res.status(403).json({ error: 'Acesso exclusivo aos administradores da plataforma Zenit.' });
    }

    const path = req.path.replace(/\/$/, '');
    const companyScoped = /^\/users\/\d+\/account-access(?:\/(?:grant|grant-all|revoke|revoke-all|bulk-update))?$/.test(path)
      || /^\/app-access\/(?:effective|company\/entitlements|users\/\d+\/grants)$/.test(path)
      || path === '/admin/operations/overview'
      || (req.method === 'GET' && path === '/financial/accounts');
    const platformScoped = /^\/companies(?:\/\d+(?:\/financial-structure)?)?$/.test(path)
      || /^\/users(?:\/\d+)?$/.test(path)
      || /^\/admin\/(?:banks(?:\/.*)?|companies\/\d+\/openai(?:\/test)?)$/.test(path)
      || /^\/app-access\/(?:catalog|company\/\d+\/entitlements)$/.test(path)
      || path === '/preferences' || path === '/preferences/color-scheme';

    if (!companyScoped && !platformScoped) {
      return res.status(403).json({ error: 'Recurso indisponível no Zenit Admin.' });
    }

    // Never pass undefined companyId to a tenant query, even for platform administrators.
    delete req.user.companyId;
    if (companyScoped) {
      const companyId = Number(req.get('X-Company-Id'));
      if (!Number.isSafeInteger(companyId) || companyId <= 0) {
        return res.status(400).json({ error: 'Informe a empresa que deseja administrar.' });
      }
      if (!await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })) {
        return res.status(404).json({ error: 'Empresa não encontrada.' });
      }
      req.user.companyId = companyId;
    }
    req.user.role = Role.ADMIN;
    req.user.platformAdmin = true;
    req.user.appKey = AppKey.ZENIT_ADMIN;
    return next();
  } catch (_error) {
    return res.status(500).json({ error: 'Erro ao validar acesso à plataforma.' });
  }
}
