import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import WhatsAppIntegrationService from '../services/whatsapp-integration.service';

const router = Router();
const seen = new Map<string, number>();
const sender = z.string().regex(/^\d{7,20}$/);
const bodySchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('status'), sender }).strict(),
  z.object({ operation: z.literal('disconnect'), sender }).strict(),
  z.object({ operation: z.literal('message'), sender, messageId: z.string().min(1).max(256),
    text: z.string().max(8000), buttonId: z.string().max(256).optional(),
    audio: z.object({ mediaId: z.string().regex(/^\d{1,128}$/) }).strict().optional() }).strict(),
  z.object({ operation: z.literal('query'), sender, tool: z.enum(['get_financial_overview', 'get_due_obligations', 'get_credit_card_overview', 'get_recent_transactions']),
    args: z.record(z.unknown()) }).strict()
]).refine(input => input.operation !== 'message' || !input.audio || (!input.text.trim() && input.buttonId === undefined));

export function verifyHubSignature(params: { secret: string; body?: Buffer; time: string; nonce: string; signature: string }, now = Date.now()) {
  if (params.secret.length < 32 || !params.body || !/^\d{13}$/.test(params.time) ||
      Math.abs(now - Number(params.time)) > 60_000 || !/^[a-f0-9]{32}$/.test(params.nonce) || !/^[a-f0-9]{64}$/.test(params.signature)) return false;
  const expected = createHmac('sha256', params.secret)
    .update(`${params.time}\n${params.nonce}\nPOST\n/api/integrations/hub/bridge\n`).update(params.body).digest('hex');
  return timingSafeEqual(Buffer.from(expected), Buffer.from(params.signature));
}

router.post('/integrations/hub/bridge', async (req, res) => {
  const secret = process.env.CASH_HUB_SHARED_SECRET || '';
  if (secret.length < 32) return res.status(503).json({ error: 'Integracao Hub desabilitada.' });
  const time = String(req.headers['x-hub-timestamp'] || '');
  const nonce = String(req.headers['x-hub-nonce'] || '');
  const signature = String(req.headers['x-hub-signature'] || '');
  if (!verifyHubSignature({ secret, body: req.rawBody, time, nonce, signature })) return res.status(401).json({ error: 'Requisicao Hub invalida.' });
  const now = Date.now();
  for (const [key, expiry] of seen) if (expiry < now) seen.delete(key);
  if (seen.has(nonce)) return res.status(409).json({ error: 'Requisicao repetida.' });
  seen.set(nonce, now + 120_000);
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Solicitacao invalida.' });
  const input = parsed.data;
  try {
    if (input.operation === 'message') return res.json(await WhatsAppIntegrationService.dispatchForHub({
      waId: input.sender, messageId: input.messageId, text: input.text, buttonId: input.buttonId, audio: input.audio
    }));
    const current = await WhatsAppIntegrationService.getHubBinding(input.sender);
    if (input.operation === 'status') return res.json({ connected: Boolean(current) });
    if (!current) return res.status(403).json({ error: 'Conexao ausente ou sem permissao.' });
    if (input.operation === 'disconnect') {
      await WhatsAppIntegrationService.disconnectBinding({ userId: current.binding.userId });
      return res.json({ disconnected: true });
    }
    return res.json(await WhatsAppIntegrationService.queryForHub(input.sender, input.tool, input.args));
  } catch {
    return res.status(422).json({ error: 'O Cash nao concluiu a operacao. Consulte o estado antes de repetir.' });
  }
});
export default router;
