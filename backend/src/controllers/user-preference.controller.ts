import { Request, Response } from 'express';
import { getUserPreference, setColorScheme } from '../services/user-preference.service';

export async function getPreferences(req: Request, res: Response) {
  // @ts-ignore
  const userId = req.user.userId as number;
  const pref = await getUserPreference(userId);
  res.json(pref || {});
}

export async function updateColorScheme(req: Request, res: Response) {
  const { colorScheme } = req.body;
  if (!colorScheme) {
    return res.status(400).json({ error: 'colorScheme é obrigatório' });
  }
  // @ts-ignore
  const userId = req.user.userId as number;
  const pref = await setColorScheme(userId, colorScheme);
  res.json(pref);
}
