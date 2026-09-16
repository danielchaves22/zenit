import { Request, Response } from 'express';
import PersonalFinancialProfileService from '../services/personal-financial-profile.service';
import { SavePersonalFinancialProfileBody } from '../validators/personal-financial-profile.validator';

function authenticatedUserId(req: Request): number {
  const userId = req.user?.userId;
  if (!userId) throw new Error('Usuário autenticado não encontrado');
  return userId;
}

export async function getPersonalFinancialProfile(req: Request, res: Response) {
  try {
    const result = await PersonalFinancialProfileService.get(authenticatedUserId(req));
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao carregar perfil de planejamento financeiro'
    });
  }
}

export async function savePersonalFinancialProfile(req: Request, res: Response) {
  try {
    const result = await PersonalFinancialProfileService.save(
      authenticatedUserId(req),
      req.body as SavePersonalFinancialProfileBody
    );
    return res.status(200).json(result);
  } catch (error: any) {
    return res.status(400).json({
      error: error.message || 'Erro ao salvar perfil de planejamento financeiro'
    });
  }
}
