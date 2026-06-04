import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import AssistantOrchestratorService from '../services/assistant-orchestrator.service';
import AssistantSessionService from '../services/assistant-session.service';
import PendingActionService from '../services/pending-action.service';
import { logger } from '../utils/logger';

function getUserContext(req: Request): { userId: number; companyId: number; role: Role } {
  const userId = req.user?.userId;
  const companyId = req.user?.companyId;
  const role = req.user?.role;

  if (!userId || !companyId || !role) {
    throw new Error('Contexto autenticado invalido para o assistente');
  }

  return { userId, companyId, role };
}

function writeSse(res: Response, event: string, payload: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function createAssistantSession(req: Request, res: Response) {
  try {
    const { userId, companyId } = getUserContext(req);
    const session = await AssistantSessionService.createSession({
      userId,
      companyId,
      title: req.body?.title
    });

    return res.status(201).json({
      sessionId: session.id,
      status: session.status,
      createdAt: session.createdAt.toISOString()
    });
  } catch (error) {
    logger.error('Erro ao criar sessao do assistente', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.userId,
      companyId: req.user?.companyId
    });

    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao criar sessao do assistente'
    });
  }
}

export async function getAssistantSessionHistory(req: Request, res: Response) {
  try {
    const { userId, companyId } = getUserContext(req);
    const history = await AssistantSessionService.listHistory({
      sessionId: Number(req.params.sessionId),
      userId,
      companyId
    });

    return res.status(200).json(history);
  } catch (error) {
    logger.error('Erro ao buscar historico do assistente', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      sessionId: req.params.sessionId
    });

    return res.status(404).json({
      error: error instanceof Error ? error.message : 'Erro ao buscar historico do assistente'
    });
  }
}

export async function streamAssistantMessage(req: Request, res: Response) {
  let started = false;

  try {
    const { userId, companyId, role } = getUserContext(req);
    const sessionId = Number(req.params.sessionId);
    const message = String(req.body.message || '').trim();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    started = true;

    await AssistantOrchestratorService.processTurn({
      sessionId,
      userId,
      companyId,
      role,
      message,
      onEvent: async (event) => {
        writeSse(res, event.type, event);
      }
    });

    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Erro no streaming do assistente', {
      error: message,
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      sessionId: req.params.sessionId
    });

    if (!started) {
      return res.status(400).json({ error: message });
    }

    writeSse(res, 'turn.error', {
      type: 'turn.error',
      sessionId: Number(req.params.sessionId),
      error: message
    });
    res.end();
  }
}

export async function confirmAssistantPendingAction(req: Request, res: Response) {
  try {
    const { userId, companyId, role } = getUserContext(req);
    const result = await PendingActionService.confirmTransactionDraft({
      pendingActionId: Number(req.params.pendingActionId),
      userId,
      companyId,
      role
    });

    return res.status(200).json(result);
  } catch (error) {
    logger.error('Erro ao confirmar acao pendente do assistente', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      pendingActionId: req.params.pendingActionId
    });

    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao confirmar acao pendente'
    });
  }
}

export async function cancelAssistantPendingAction(req: Request, res: Response) {
  try {
    const { userId, companyId } = getUserContext(req);
    const pendingAction = await PendingActionService.cancelPendingAction({
      pendingActionId: Number(req.params.pendingActionId),
      userId,
      companyId
    });

    return res.status(200).json({
      pendingAction
    });
  } catch (error) {
    logger.error('Erro ao cancelar acao pendente do assistente', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.userId,
      companyId: req.user?.companyId,
      pendingActionId: req.params.pendingActionId
    });

    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Erro ao cancelar acao pendente'
    });
  }
}
