import { AppKey } from '@prisma/client'
import { Request, Response } from 'express'
import AppAccessService from '../services/app-access.service'
import UserService from '../services/user.service'
import { toPrismaAppKey } from '../constants/app-access'

function getContext(req: Request) {
  return {
    userId: req.user.userId,
    role: req.user.role,
    companyId: req.user.companyId as number
  }
}

export async function getAppCatalog(_req: Request, res: Response) {
  const catalog = await AppAccessService.listCatalog()
  return res.status(200).json(catalog)
}

export async function getCurrentCompanyEntitlements(req: Request, res: Response) {
  const { companyId } = getContext(req)
  const data = await AppAccessService.getCompanyEntitlements(companyId)
  return res.status(200).json(data)
}

export async function getCompanyEntitlementsById(req: Request, res: Response) {
  const { role, companyId } = getContext(req)
  const targetCompanyId = Number(req.params.companyId)
  if (isNaN(targetCompanyId)) {
    return res.status(400).json({ error: 'companyId invalido.' })
  }
  if (role !== 'ADMIN' && targetCompanyId !== companyId) {
    return res.status(403).json({ error: 'Acesso negado.' })
  }
  const data = await AppAccessService.getCompanyEntitlements(targetCompanyId)
  return res.status(200).json(data)
}

export async function updateCurrentCompanyEntitlements(req: Request, res: Response) {
  const { role, companyId } = getContext(req)
  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Acesso negado.' })
  }

  const entries: unknown[] = Array.isArray(req.body.entitlements) ? req.body.entitlements : []
  const payload = entries
    .map((entry): { appKey: AppKey; enabled: boolean } | null => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as { appKey?: string; enabled?: boolean }
      const appKey = toPrismaAppKey(item.appKey)
      if (!appKey) return null
      return { appKey, enabled: Boolean(item.enabled) }
    })
    .filter((item): item is { appKey: AppKey; enabled: boolean } => item !== null)

  await AppAccessService.setCompanyEntitlements(companyId, payload)
  const data = await AppAccessService.getCompanyEntitlements(companyId)
  return res.status(200).json(data)
}

export async function getUserAppGrants(req: Request, res: Response) {
  const { role, companyId } = getContext(req)
  const targetUserId = Number(req.params.id)

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'ID de usuario invalido.' })
  }

  if (role === 'USER' && targetUserId !== req.user.userId) {
    return res.status(403).json({ error: 'Acesso negado.' })
  }

  if (role === 'SUPERUSER') {
    const belongs = await UserService.userBelongsToCompany(targetUserId, companyId)
    if (!belongs) {
      return res.status(403).json({ error: 'Acesso negado para este usuario.' })
    }
  }

  const data = await AppAccessService.getUserGrants(targetUserId, companyId)
  return res.status(200).json(data)
}

export async function updateUserAppGrants(req: Request, res: Response) {
  const { role, companyId } = getContext(req)
  const targetUserId = Number(req.params.id)

  if (isNaN(targetUserId)) {
    return res.status(400).json({ error: 'ID de usuario invalido.' })
  }

  if (role !== 'ADMIN' && role !== 'SUPERUSER') {
    return res.status(403).json({ error: 'Acesso negado.' })
  }

  if (role === 'SUPERUSER') {
    const belongs = await UserService.userBelongsToCompany(targetUserId, companyId)
    if (!belongs) {
      return res.status(403).json({ error: 'Acesso negado para este usuario.' })
    }
  }

  const entries: unknown[] = Array.isArray(req.body.grants) ? req.body.grants : []
  const payload = entries
    .map((entry): { appKey: AppKey; granted: boolean } | null => {
      if (!entry || typeof entry !== 'object') return null
      const item = entry as { appKey?: string; granted?: boolean }
      const appKey = toPrismaAppKey(item.appKey)
      if (!appKey) return null
      return { appKey, granted: Boolean(item.granted) }
    })
    .filter((item): item is { appKey: AppKey; granted: boolean } => item !== null)

  await AppAccessService.setUserGrants(targetUserId, companyId, payload)
  const data = await AppAccessService.getUserGrants(targetUserId, companyId)
  return res.status(200).json(data)
}

export async function getCurrentEffectiveAccess(req: Request, res: Response) {
  const { userId, companyId } = getContext(req)
  const data = await AppAccessService.getEffectiveAccess(userId, companyId)
  return res.status(200).json(data)
}
