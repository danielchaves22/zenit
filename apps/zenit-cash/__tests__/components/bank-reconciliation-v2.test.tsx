import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Workspace from '@/components/financial/BankReconciliationV2Workspace';
import Classic from '@/components/financial/BankReconciliationWorkspace';
import api from '@/lib/api';
import { BankCandidate, BankItem, BankSearchResult, BankWorkspace } from '@/lib/bank-reconciliation';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: any) => <a {...props} href={typeof href === 'string' ? href : `${href.pathname}?${new URLSearchParams(href.query)}`}>{children}</a> }));
const item = (id: number): BankItem => ({ id, date: '2026-08-22', amount: '-20.00', description: `Movimento ${id}` });
let data: BankWorkspace;
let result: (item: BankItem) => BankSearchResult;
const candidate = (i: BankItem): BankCandidate => ({ key: `pair-${i.id}`, feedbackToken: 'receipt', itemIds: [i.id], items: [i], amount: i.amount, difference: '0.00', score: 100, reason: 'Valor e data conferem', source: 'RULE',
  confidence: { level: 'HIGH', reasons: ['Valor exato', 'Mesma data'] }, transactions: [{ id: i.id + 100, description: `Cash ${i.id}`, amount: i.amount, date: i.date, status: 'COMPLETED', type: 'EXPENSE', version: '2026-08-22T00:00:00.000Z' }] });
beforeEach(() => {
  vi.clearAllMocks();
  data = { account: { id: 1, name: 'Conta teste', isActive: true }, month: '2026-08', session: null, items: [item(1), item(2)], page: 1, pageSize: 50, total: 2,
    summary: { total: 2, pending: 2, confirmed: 0, ignored: 0, credits: '0.00', debits: '-40.00', unmatchedTransactions: 2, restrictedTransactions: 0 }, imports: [], history: [] };
  result = i => ({ itemId: i.id, candidates: [candidate(i)], assessment: 'CANDIDATES', diagnosis: 'READY', searchWindowDays: 7 });
  vi.mocked(api.get).mockImplementation(async (url, config) => {
    if (String(url).endsWith('/diagnostics')) return { data: { cutoffDate: '2026-08-31', statementClosing: '1000.00', cashClosing: '995.00', difference: '5.00', pendingStatementNet: '-40.00', unmatchedCashNet: '-40.00', ignoredNet: '0.00', warnings: [] } } as any;
    if (String(url).endsWith('/transactions')) return { data: { items: data.items.flatMap(i => candidate(i).transactions), total: 2 } } as any;
    if (String(url).endsWith('/scan') || String(url).endsWith('/missing')) return { data: { rows: data.items.filter(i => !i.activeGroupId).map(item => ({ item, result: result(item) })), nextCursor: null } } as any;
    const items = config?.params?.filter === 'PENDING' ? data.items.filter(i => !i.activeGroupId && !i.ignoredAt) : data.items;
    return { data: { ...data, items, total: items.length } } as any;
  });
  vi.mocked(api.post).mockImplementation(async (url, body: any) => {
    if (String(url).endsWith('/suggestions/batch')) return { data: { results: body.itemIds.map((id: number) => result(data.items.find(i => i.id === id)!)) } };
    if (String(url).endsWith('/confirm')) {
      const changed = data.items.filter(i => body.itemIds.includes(i.id)).map(i => ({ ...i, activeGroupId: 1 }));
      data = { ...data, items: data.items.map(i => changed.find(c => c.id === i.id) || i), summary: { ...data.summary, confirmed: changed.length, pending: data.summary.pending - changed.length } };
      return { data: { change: { items: changed, transactions: changed.flatMap(i => candidate(i).transactions), historyDescriptions: [], groups: [] } } };
    }
    return { data: {} };
  });
});
const open = async () => { const rendered = render(<Workspace accountId={1} month="2026-08" onMonthChange={vi.fn()} />); await screen.findByText('Cash 1'); return rendered; };

describe('Guided reconciliation transition', () => {
  it('uses its discovery routes, preserves the classic link and separates focus from batch selection', async () => {
    await open();
    expect(screen.getByRole('link', { name: 'Usar conciliação atual' })).toHaveAttribute('href', '/financial/accounts/1/reconciliation?month=2026-08');
    expect(screen.getByRole('checkbox', { name: 'Incluir Movimento 1 no lote' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Conferir Movimento 2' }));
    expect(await screen.findByText('Cash 2')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Incluir Movimento 2 no lote' })).not.toBeChecked();
    expect(api.post).toHaveBeenCalledWith('/financial/accounts/1/reconciliation-v2/2026-08/suggestions/batch', expect.objectContaining({ useAi: false }), expect.any(Object));
    expect(screen.queryByRole('button', { name: 'Solicitar parecer da IA' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Diagnóstico financeiro' })).toHaveTextContent('R$ 5,00');
  });
  it('reviews before confirming, advances the queue and exposes the same link in the classic view', async () => {
    const view = await open();
    fireEvent.click(screen.getByRole('button', { name: 'Conferir e confirmar' }));
    expect(vi.mocked(api.post).mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar vínculo' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Conferir Movimento 1' })).not.toBeInTheDocument());
    expect(await screen.findByText('Cash 2')).toBeInTheDocument();
    view.unmount();
    render(<Classic accountId={1} month="2026-08" onMonthChange={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Conciliado' })).toBeInTheDocument();
  });
  it('offers correction instead of confirming a value discrepancy and keeps its return context', async () => {
    result = i => ({ itemId: i.id, candidates: [{ ...candidate(i), amount: '-25.00', difference: '5.00', confidence: { level: 'LOW', reasons: ['Valor divergente'] },
      transactions: [{ ...candidate(i).transactions[0], amount: '-25.00' }] }], diagnosis: 'AMOUNT_DIFFERENCE', assessment: 'CANDIDATES' });
    await open();
    expect(screen.getByRole('button', { name: 'Conferir e confirmar' })).toBeDisabled();
    expect(screen.getByText('Há um lançamento parecido com valor diferente. Confira o registro existente antes de criar outro.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Abrir para conferir ou corrigir' });
    expect(decodeURIComponent(link.getAttribute('href')!)).toContain('reconciliation-v2?month=2026-08&focus=1');
    expect(screen.getByRole('button', { name: 'Solicitar parecer da IA' })).toBeEnabled();
  });
  it('searches manually inside the comparison panel and confirms only an exact selection', async () => {
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Buscar no Cash' }));
    await screen.findByRole('checkbox', { name: 'Escolher Cash 1' });
    expect(api.get).toHaveBeenCalledWith('/financial/accounts/1/reconciliation-v2/2026-08/transactions', expect.objectContaining({ params: { page: 1, search: '', amount: '20', days: 31 } }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Escolher Cash 1' }));
    expect(screen.getByRole('button', { name: 'Conferir seleção manual' })).toBeEnabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Escolher Cash 2' }));
    expect(screen.getByRole('button', { name: 'Conferir seleção manual' })).toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Conferir movimentos' })).toHaveAttribute('aria-selected', 'true');
  });
  it('filters by the action needed across the month and does not invoke AI on selection', async () => {
    result = i => ({ itemId: i.id, candidates: [candidate(i)], assessment: 'CANDIDATES', diagnosis: i.id === 1 ? 'READY' : 'DATE_DIFFERENCE' });
    await open();
    fireEvent.change(screen.getByLabelText('Filtrar fila de conciliação'), { target: { value: 'DATE_DIFFERENCE' } });
    await screen.findByText(/Busca concluída/);
    expect(screen.queryByRole('button', { name: 'Conferir Movimento 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conferir Movimento 2' })).toBeInTheDocument();
    expect(vi.mocked(api.post).mock.calls.every(([, body]: any) => body.useAi !== true)).toBe(true);
  });
});
