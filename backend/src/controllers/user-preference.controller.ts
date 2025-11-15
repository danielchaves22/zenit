import { Request, Response } from 'express';
import { getUserPreference, setColorScheme, updateUserPreferences } from '../services/user-preference.service';

function formatPreference(preference: any) {
  return {
    colorScheme: preference?.colorScheme ?? null,
    confirmNegativeBalanceMovements: preference?.confirmNegativeBalanceMovements ?? true
  };
}

export async function getPreferences(req: Request, res: Response) {
  // @ts-ignore
  const userId = req.user.userId as number;
  const pref = await getUserPreference(userId);
  res.json(formatPreference(pref));
}

export async function updateColorScheme(req: Request, res: Response) {
  const { colorScheme } = req.body;
  if (!colorScheme) {
    return res.status(400).json({ error: 'colorScheme é obrigatório' });
  }
  // @ts-ignore
  const userId = req.user.userId as number;
  const pref = await setColorScheme(userId, colorScheme);
  res.json(formatPreference(pref));
}

export async function updatePreferences(req: Request, res: Response) {
  // @ts-ignore
  const userId = req.user.userId as number;
  const { colorScheme, confirmNegativeBalanceMovements } = req.body;

  const pref = await updateUserPreferences(userId, {
    colorScheme,
    confirmNegativeBalanceMovements
  });

  res.json(formatPreference(pref));
}
