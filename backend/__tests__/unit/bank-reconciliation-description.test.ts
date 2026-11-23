jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: {
  financialAccount: { findFirst: jest.fn() },
  bankStatementItem: { findMany: jest.fn() }
} }));
jest.mock('../../src/services/user-financial-account-access.service', () => ({
  __esModule: true, default: { getUserAccessibleAccounts: jest.fn() }
}));
jest.mock('../../src/services/reconciliation-description-suggestion.service', () => ({
  loadReconciliationDescriptionSuggestions: jest.fn()
}));

import prisma from '../../src/lib/prisma';
import BankReconciliationService from '../../src/services/bank-reconciliation.service';
import AccountAccess from '../../src/services/user-financial-account-access.service';
import { loadReconciliationDescriptionSuggestions } from '../../src/services/reconciliation-description-suggestion.service';

const context = { accountId: 12, companyId: 3, userId: 8, role: 'USER' };
const raw = 'PIX *Exemplo 123';
const suggest = () => BankReconciliationService.suggestCreateDescription(context, '2026-08', 44);

describe('Bank reconciliation description prefill', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(prisma.financialAccount.findFirst).mockResolvedValue({ id: 12, type: 'CHECKING', purpose: 'GENERAL' } as any);
    jest.mocked(AccountAccess.getUserAccessibleAccounts).mockResolvedValue([12]);
    jest.mocked(prisma.bankStatementItem.findMany).mockResolvedValue([{ id: 44, description: raw, amount: '12.50' }] as any);
  });

  it('looks up the original description on the selected open statement item, in the user and company context', async () => {
    jest.mocked(loadReconciliationDescriptionSuggestions).mockResolvedValue(new Map([[raw, 'Feira do bairro']]));
    await expect(suggest()).resolves.toEqual({ suggestedDescription: 'Feira do bairro' });
    expect(prisma.bankStatementItem.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { in: [44] }, accountId: 12, activeGroupId: null, ignoredAt: null,
        date: { gte: new Date('2026-08-01T00:00:00Z'), lt: new Date('2026-09-01T00:00:00Z') }
      }
    }));
    expect(loadReconciliationDescriptionSuggestions).toHaveBeenCalledWith({ companyId: 3, userId: 8, sourceDescriptions: [raw] });
  });

  it('returns an empty suggestion when the history has no matching source description', async () => {
    jest.mocked(loadReconciliationDescriptionSuggestions).mockResolvedValue(new Map());
    await expect(suggest()).resolves.toEqual({ suggestedDescription: null });
  });

  it('rejects an inaccessible account or unavailable statement item before reading any historical descriptions', async () => {
    jest.mocked(AccountAccess.getUserAccessibleAccounts).mockResolvedValueOnce([]);
    await expect(suggest()).rejects.toThrow('Acesso negado');
    expect(prisma.bankStatementItem.findMany).not.toHaveBeenCalled();
    jest.mocked(prisma.bankStatementItem.findMany).mockResolvedValueOnce([]);
    await expect(suggest()).rejects.toThrow('não pertence a esta conta e mês');
    expect(loadReconciliationDescriptionSuggestions).not.toHaveBeenCalled();
  });
});
