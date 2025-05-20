// src/middlewares/authorize.middleware.ts

import { Request, Response, NextFunction } from 'express';
import {
  permissionPolicy,
  Role,
  Resource,
  Action,
  Perm
} from '../policies/permission.policy';

export function authorize(action: Action, resource: Resource) {
  return (req: Request, res: Response, next: NextFunction) => {
    // @ts-ignore: authMiddleware já colocou req.user
    const role = req.user.role as Role;
    // aqui TS sabe que `role` e `resource` são chaves válidas
    const perms: Perm[] = permissionPolicy[role][resource] || [];

    const anyPerm: Perm = `${action}:any`;
    const ownPerm: Perm = `${action}:own`;

    if (perms.includes(anyPerm)) {
      return next();
    }
    if (perms.includes(ownPerm)) {
      // a filtragem “own” é feita no controller
      return next();
    }
    return res.status(403).json({ error: 'Acesso negado' });
  };
}
