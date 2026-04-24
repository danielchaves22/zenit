import { Request, Response, NextFunction } from 'express'
import AppAccessService from '../services/app-access.service'
import { APP_HEADER, toPrismaAppKey } from '../constants/app-access'

export async function appAccessMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const rawHeader = req.headers[APP_HEADER]
    const appHeaderValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
    const appKey = toPrismaAppKey(appHeaderValue)

    if (!appKey) {
      return res.status(400).json({
        error: 'Cabecalho X-App-Key invalido ou ausente.'
      })
    }

    const userId = req.user?.userId
    const companyId = req.user?.companyId

    if (!userId || !companyId) {
      return res.status(403).json({ error: 'Contexto de usuario/empresa invalido.' })
    }

    const allowed = await AppAccessService.hasEffectiveAccess(userId, companyId, appKey)
    if (!allowed) {
      return res.status(403).json({
        error: 'Acesso negado para este aplicativo na empresa selecionada.'
      })
    }

    req.user.appKey = appKey
    return next()
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao validar acesso ao aplicativo.' })
  }
}
