import { Request, Response } from 'express';
import WhatsAppIntegrationService from '../services/whatsapp-integration.service';
import { logger } from '../utils/logger';

function getContext(req: Request) {
  return {
    companyId: req.user.companyId as number | undefined,
    userId: req.user.userId
  };
}

export async function getWhatsAppIntegrationStatus(req: Request, res: Response) {
  try {
    const { companyId, userId } = getContext(req);
    const status = await WhatsAppIntegrationService.getStatus({
      currentCompanyId: companyId,
      userId
    });

    return res.status(200).json(status);
  } catch (error: any) {
    logger.error('Erro ao consultar status do WhatsApp:', error);
    return res.status(500).json({ error: 'Erro ao consultar status do WhatsApp.' });
  }
}

export async function createWhatsAppBindingChallenge(req: Request, res: Response) {
  try {
    const { companyId, userId } = getContext(req);
    const challenge = await WhatsAppIntegrationService.createBindingChallenge({
      currentCompanyId: companyId,
      preferredCompanyId: req.body.preferredCompanyId,
      userId
    });

    return res.status(200).json(challenge);
  } catch (error: any) {
    logger.error('Erro ao criar desafio de vinculacao WhatsApp:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao criar desafio de vinculacao WhatsApp.'
    });
  }
}

export async function updateWhatsAppActiveCompany(req: Request, res: Response) {
  try {
    const { userId } = getContext(req);
    const result = await WhatsAppIntegrationService.updateActiveCompany({
      companyId: req.body.companyId,
      userId
    });

    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao atualizar empresa ativa do WhatsApp:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao atualizar empresa ativa do WhatsApp.'
    });
  }
}

export async function disconnectWhatsAppBinding(req: Request, res: Response) {
  try {
    const { userId } = getContext(req);
    const result = await WhatsAppIntegrationService.disconnectBinding({ userId });
    return res.status(200).json(result);
  } catch (error: any) {
    logger.error('Erro ao desconectar WhatsApp:', error);
    return res.status(400).json({
      error: error.message || 'Erro ao desconectar WhatsApp.'
    });
  }
}
