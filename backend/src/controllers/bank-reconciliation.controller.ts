import { Request, Response } from 'express';
import { z } from 'zod';
import Service, { BankContext } from '../services/bank-reconciliation.service';

const month = z.string().regex(/^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/, 'Mês inválido.');
const id = z.number().int().positive();
const itemIds = z.array(id).min(1).max(20).refine(ids => new Set(ids).size === ids.length, 'Itens repetidos.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const link = z.object({ itemIds, transactions: z.array(z.object({ id, version: z.string().datetime() })).min(1).max(20),
  settlePending: z.boolean().optional(), settlementDate: date.optional(), note: z.string().trim().max(500).optional(),
  cacheId: id.optional(), candidateKey: z.string().max(64).optional() });
const file = z.object({ fileBase64: z.string().min(1).max(6_666_668), fileName: z.string().trim().min(1).max(255) });
const paging = z.object({ page: z.coerce.number().int().min(1).max(100000).default(1), filter: z.enum(['ALL', 'PENDING', 'CONFIRMED']).default('ALL') });

// Validate each source separately: query/body can never override the authorized path account.
function endpoint(action: (context: BankContext, month: string, req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response) => {
    try {
      const accountId = z.coerce.number().int().positive().parse(req.params.id);
      const selectedMonth = month.parse(req.params.month);
      const { companyId, userId, role } = req.user;
      if (!companyId) return res.status(403).json({ error: 'Contexto de empresa ausente.' });
      return res.json(await action({ accountId, companyId, userId, role }, selectedMonth, req));
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message || 'Dados inválidos.' });
      if (error.code === 'P2002' || error.code === 'P2034' || error.code === 'P2010') return res.status(409).json({ error: 'A conciliação mudou durante a operação. Atualize a tela e tente novamente.' });
      return res.status(400).json({ error: error.message || 'Não foi possível concluir a operação.' });
    }
  };
}
export const loadBankReconciliation = endpoint((c, m, req) => { const q = paging.parse(req.query); return Service.load(c, m, q.page, q.filter); });
export const previewBankStatement = endpoint((c, m, req) => Service.preview(c, m, file.parse(req.body).fileBase64));
export const importBankStatement = endpoint((c, m, req) => { const f = file.parse(req.body); return Service.import(c, m, f.fileBase64, f.fileName); });
export const resetBankReconciliation = endpoint((c, m, req) => { z.object({ confirmed: z.literal(true) }).parse(req.body); return Service.reset(c, m); });
export const suggestBankCandidates = endpoint((c, m, req) => { const input = z.object({ itemIds, useAi: z.union([z.boolean(), z.literal('auto')]).default('auto') }).parse(req.body); return Service.candidates(c, m, input.itemIds, input.useAi); });
export const suggestBankCandidatesBatch = endpoint((c, m, req) => { const input = z.object({ itemIds: z.array(id).min(1).max(5).refine(ids => new Set(ids).size === ids.length, 'Itens repetidos.'),
  useAi: z.union([z.boolean(), z.literal('auto')]).default('auto') }).parse(req.body); return Service.candidatesBatch(c, m, input.itemIds, input.useAi); });
export const confirmBankMatch = endpoint((c, m, req) => Service.confirm(c, m, link.parse(req.body)));
export const rejectBankMatch = endpoint((c, m, req) => Service.reject(c, m, link.parse(req.body)));
export const createBankTransaction = endpoint((c, m, req) => Service.create(c, m, z.object({ itemIds,
  description: z.string().trim().min(1).max(255), categoryId: id.optional(), transferAccountId: id.optional(), effectiveDate: date }).parse(req.body)));
export const undoBankMatch = endpoint((c, m, req) => { const input = z.object({ groupId: id, note: z.string().trim().min(1).max(500) }).parse(req.body); return Service.undo(c, m, input.groupId, input.note); });
export const updateBankMonthStatus = endpoint((c, m, req) => Service.status(c, m, z.object({ status: z.enum(['OPEN', 'COMPLETED']) }).parse(req.body).status));
export const getBankAudit = endpoint((c, m, req) => Service.audit(c, m, paging.parse(req.query).page));
export const getBankTransactions = endpoint((c, m, req) => { const q = z.object({ page: z.coerce.number().int().min(1).default(1), search: z.string().max(120).default(''),
  days: z.coerce.number().int().min(0).max(366).default(0), unmatched: z.enum(['true', 'false']).default('true') }).parse(req.query);
  return Service.transactions(c, m, q.search, q.page, q.days, q.unmatched === 'true'); });
