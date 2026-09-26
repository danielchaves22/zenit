import { Request, Response } from 'express';
import HabitualExpensePreferenceService from '../services/habitual-expense-preference.service';
import { getWorkspacePlanningCapabilities } from '../policies/workspace-planning-access.policy';

export async function getHabitualExpensePreference(req: Request, res: Response) {
  try {
    return res.json({
      ...(await HabitualExpensePreferenceService.get(req.user.companyId!)),
      access: getWorkspacePlanningCapabilities(req.user)
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}

export async function saveHabitualExpensePreference(req: Request, res: Response) {
  try {
    return res.json({
      ...(await HabitualExpensePreferenceService.save(req.user.companyId!, req.body.categoryIds)),
      access: getWorkspacePlanningCapabilities(req.user)
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}
