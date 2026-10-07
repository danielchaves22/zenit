import { AppKey } from '@prisma/client';
import { Request, Response, NextFunction } from 'express';
import { APP_HEADER, toPrismaAppKey } from '../constants/app-access';

// Until a financial handoff is implemented, a Bizz grant authorizes only Bizz.
// Other applications retain their existing authorization policies.
export function bizzScopeMiddleware(req: Request, res: Response, next: NextFunction) {
  const appKey = toPrismaAppKey(req.get(APP_HEADER));
  const path = req.path.replace(/\/+$/, '').toLowerCase();
  const bizzPath = path === '/bizz' || path.startsWith('/bizz/');
  if (bizzPath && appKey && appKey !== AppKey.ZENIT_BIZZ) {
    return res.status(403).json({ error: 'Esta operação exige acesso ao Zenit Bizz.' });
  }
  if (appKey === AppKey.ZENIT_BIZZ && !bizzPath && path !== '/app-access/effective') {
    return res.status(403).json({ error: 'A permissão do Bizz não autoriza esta operação.' });
  }
  return next();
}
