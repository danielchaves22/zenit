import { NextFunction, Request, Response } from 'express';
import {
  canAccessWorkspacePlanning,
  WorkspacePlanningAction
} from '../policies/workspace-planning-access.policy';

export function requireWorkspacePlanningAccess(action: WorkspacePlanningAction) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (
      canAccessWorkspacePlanning(
        {
          role: req.user.role,
          isCompanyOwner: req.user.isCompanyOwner
        },
        action
      )
    ) {
      return next();
    }

    return res.status(403).json({
      error: 'Acesso negado: somente gestores do workspace podem alterar o planejamento financeiro.',
      code: 'WORKSPACE_PLANNING_MANAGEMENT_FORBIDDEN'
    });
  };
}
