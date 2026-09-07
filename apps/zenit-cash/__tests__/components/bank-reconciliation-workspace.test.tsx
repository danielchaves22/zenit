import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Workspace from '@/components/financial/BankReconciliationWorkspace';
import api from '@/lib/api';
import { BankItem, BankWorkspace } from '@/lib/bank-reconciliation';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: any) => <a {...props} href={typeof href === 'string' ? href : '#'}>{children}</a> }));
const item = (id: number): BankItem => ({ id, date: '2026-08-22', amount: id % 2 ? '-20.00' : '30.00', description: `Movimento ${id}`, activeGroupId: null });
let data: BankWorkspace;
const makeData = (items: BankItem[]): BankWorkspace => ({ account: { id: 1, name: 'Conta teste', isActive: true }, month: '2026-08', session: null, items, page: 1, pageSize: 50, total: items.length,
  summary: { total: items.length, confirmed: 0, pending: items.length, credits: '30', debits: '-20', unmatchedTransactions: items.length, restrictedTransactions: 0 }, imports: [], history: [] });
const selectAll = () => screen.getByRole('checkbox', { name: 'Marcar ou desmarcar todos os movimentos desta página' });
const candidate = (i: BankItem) => ({ key: `candidate-${i.id}`, itemIds: [i.id], items: [i], amount: i.amount, difference: '0', score: 100, reason: 'Mesma data e valor', source: 'RULE',
  confidence: { level: 'HIGH', reasons: ['Valor exato', 'Mesma data'] },
  transactions: [{ id: i.id + 100, description: `Lançamento ${i.id}`, amount: i.amount, date: i.date, status: 'COMPLETED', type: i.amount.startsWith('-') ? 'EXPENSE' : 'INCOME', version: '2026-08-22T00:00:00.000Z' }] });

beforeEach(() => {
  vi.clearAllMocks(); data = makeData([item(1), item(2)]);
  vi.mocked(api.get).mockImplementation(async () => ({ data }) as any);
  vi.mocked(api.post).mockImplementation(async (url, body: any) => {
    if (String(url).endsWith('/suggestions/batch')) return { data: { results: body.itemIds.map((id: number) => ({ itemId: id, candidates: [candidate(data.items.find(i => i.id === id)!)], cacheId: id + 200 })) } };
    if (String(url).endsWith('/suggestions')) return { data: { candidates: [candidate(data.items[0])] } };
    if (String(url).endsWith('/confirm')) data = { ...data, items: data.items.map(i => body.itemIds.includes(i.id) ? { ...i, activeGroupId: 1 } : i) };
    if (String(url).endsWith('/reset')) data = makeData([]);
    if (String(url).endsWith('/preview')) return { data: { bank: 'NUBANK', accountNumber: null, inMonth: 2, existing: 0, credits: '30', debits: '-20', openingBalance: null, closingBalance: null, warnings: [], outsideCount: 0, sample: [], outside: [] } };
    if (String(url).endsWith('/imports')) data = makeData([item(1), item(2)]);
    return { data: {} };
  });
});
const open = async () => { render(<Workspace accountId={1} month="2026-08" onMonthChange={vi.fn()} />); await screen.findByText('Conta teste · Seu progresso é salvo a cada confirmação.'); };

describe('Simplified bank reconciliation', () => {
  it('selects all eligible rows, exposes partial selection and deselects without including confirmed items', async () => {
    data.items.push({ ...item(3), activeGroupId: 9 });
    await open();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Selecionar Movimento 1 em 22/08/2026' }));
    expect(selectAll()).toBePartiallyChecked();
    fireEvent.click(selectAll());
    expect(selectAll()).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Movimento 3 em 22/08/2026' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar todos' }));
    expect(selectAll()).not.toBeChecked();
  });
  it('searches fifty mixed-direction rows independently in bounded batches and does not confirm any', async () => {
    data = makeData(Array.from({ length: 50 }, (_, index) => item(index + 1)));
    vi.useFakeTimers();
    try {
      await act(async () => { render(<Workspace accountId={1} month="2026-08" onMonthChange={vi.fn()} />); });
      fireEvent.click(selectAll());
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      const calls = vi.mocked(api.post).mock.calls;
      expect(calls).toHaveLength(10);
      expect(calls.every(([url, body]) => String(url).endsWith('/suggestions/batch') && (body as any).itemIds.length === 5 && (body as any).useAi === false)).toBe(true);
      expect(calls.flatMap(([, body]) => (body as any).itemIds)).toEqual(data.items.map(i => i.id));
      expect(screen.getAllByRole('button', { name: 'Revisar vínculo' })).toHaveLength(50);
      expect(screen.queryByRole('button', { name: 'Sugerir com IA' })).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  }, 15000);
  it('keeps the remaining suggestions after confirming one candidate and sends its own cache reference', async () => {
    await open(); fireEvent.click(selectAll());
    const reviewButtons = await screen.findAllByRole('button', { name: 'Revisar vínculo' });
    fireEvent.click(reviewButtons[0]); fireEvent.click(screen.getByRole('button', { name: 'Confirmar vínculo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Revisar vínculo' })).toHaveLength(1);
    expect(screen.getByRole('region', { name: 'Correspondências para Movimento 2' })).toBeInTheDocument();
    expect(vi.mocked(api.post).mock.calls.find(([url]) => String(url).endsWith('/confirm'))?.[1]).toMatchObject({ itemIds: [1], cacheId: 201 });
  });
  it('uses combined totals only when explicitly requested', async () => {
    data = makeData([item(1), item(3)]);
    await open(); fireEvent.click(selectAll()); fireEvent.click(screen.getByRole('checkbox', { name: 'Buscar pela soma dos selecionados (agrupar)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Buscar correspondências' }));
    await screen.findByRole('button', { name: 'Revisar vínculo' });
    expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/suggestions$/), { itemIds: [1, 3] }, expect.any(Object));
  });
  it('requires reset confirmation and shows the upload panel again only after resetting', async () => {
    await open();
    expect(screen.queryByText('Importar extrato da conta')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar conciliação' }));
    expect(vi.mocked(api.post).mock.calls.some(([url]) => String(url).endsWith('/reset'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(vi.mocked(api.post).mock.calls.some(([url]) => String(url).endsWith('/reset'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar conciliação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar e reiniciar' }));
    await screen.findByText('Importar extrato da conta');
    expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/\/reset$/), { confirmed: true });
  });
  it('starts reconciliation from the preview and hides the import panel afterward', async () => {
    data = makeData([]); await open();
    fireEvent.change(screen.getByLabelText('Selecionar extrato OFX ou CSV'), { target: { files: [new File(['test'], 'extrato.csv', { type: 'text/csv' })] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Iniciar Conciliação' }));
    await waitFor(() => expect(screen.queryByText('Importar extrato da conta')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reiniciar conciliação' })).toBeInTheDocument();
  });
  it('does not offer reset, upload or selection in a completed month', async () => {
    data.session = { id: 1, month: '2026-08', status: 'COMPLETED' };
    await open();
    expect(screen.queryByRole('button', { name: 'Reiniciar conciliação' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Selecionar extrato OFX ou CSV')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
  it('keeps selection available during the automatic search and reuses results after deselection', async () => {
    let complete: (value: any) => void = () => {};
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    await open();
    await screen.findAllByText('Buscando…');
    fireEvent.click(selectAll());
    expect(selectAll()).toBeChecked();
    await act(async () => complete({ data: { results: data.items.map(i => ({ itemId: i.id, candidates: [candidate(i)] })) } }));
    expect(await screen.findAllByRole('button', { name: 'Revisar vínculo' })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar todos' }));
    fireEvent.click(selectAll());
    expect(screen.getAllByRole('button', { name: 'Revisar vínculo' })).toHaveLength(2);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('refines only the selected ambiguous movement while retaining the rule suggestions', async () => {
    const defaultPost = vi.mocked(api.post).getMockImplementation()!;
    let finishAi: (value: any) => void = () => {};
    vi.mocked(api.post).mockImplementation(async (url, body: any, config) => {
      if (body.useAi === 'auto') return new Promise(resolve => { finishAi = resolve; });
      if (body.useAi === false) return { data: { results: data.items.map(i => ({ itemId: i.id, candidates: [{ ...candidate(i), confidence: { level: 'MEDIUM', reasons: ['Descrições pouco semelhantes'] } }] })) } };
      return defaultPost(url, body, config);
    });
    await open();
    fireEvent.click(screen.getByLabelText('Selecionar Movimento 1 em 22/08/2026'));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(expect.stringMatching(/batch$/), { itemIds: [1], useAi: 'auto' }, expect.any(Object)));
    expect(screen.getByRole('button', { name: 'Revisar vínculo' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Desmarcar todos' }));
    await act(async () => finishAi({ data: { results: [{ itemId: 1, candidates: [{ ...candidate(item(1)), source: 'AI' }] }] } }));
    fireEvent.click(selectAll());
    expect(screen.queryByText('Sugestão com apoio da IA')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Revisar vínculo' })).toHaveLength(2);
    expect(vi.mocked(api.post).mock.calls.filter(([, body]: any) => body.useAi === 'auto')).toHaveLength(1);
  });
  it('distinguishes failed searches from empty results and supports retrying one row', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({ response: { status: 503, data: { error: 'Indisponível' } } });
    await open();
    const retryButtons = await screen.findAllByRole('button', { name: 'Tentar novamente' });
    vi.mocked(api.post).mockResolvedValueOnce({ data: { results: [{ itemId: 1, candidates: [] }] } });
    fireEvent.click(retryButtons[0]);
    await screen.findByText('Sem correspondência encontrada');
    expect(screen.getAllByText('Falha na busca')).toHaveLength(1);
    expect(api.post).toHaveBeenLastCalledWith(expect.stringMatching(/batch$/), { itemIds: [1], useAi: false }, expect.any(Object));
  });
  it('reuses cached results when returning to a page and refreshes them on demand', async () => {
    const firstPage = data;
    firstPage.total = 51;
    const secondPage = { ...makeData([item(51)]), total: 51 };
    vi.mocked(api.get).mockImplementation(async (_url, config) => ({ data: config?.params?.page === 2 ? secondPage : firstPage }) as any);
    vi.mocked(api.post).mockImplementation(async (_url, body: any) => ({ data: { results: body.itemIds.map((id: number) => ({ itemId: id, candidates: [candidate(item(id))] })) } }));
    await open(); await screen.findAllByText('Confiabilidade alta');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Movimento 51'); await screen.findByText('Confiabilidade alta');
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByText('Movimento 1'); await screen.findAllByText('Confiabilidade alta');
    expect(api.post).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar conciliação' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3));
  });
  it('discards an old search after reset rather than reintroducing deleted suggestions', async () => {
    let complete: (value: any) => void = () => {};
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    await open(); await screen.findAllByText('Buscando…');
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar conciliação' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apagar e reiniciar' }));
    await screen.findByText('Importar extrato da conta');
    await act(async () => complete({ data: { results: [{ itemId: 1, candidates: [candidate(item(1))] }] } }));
    expect(screen.queryByText('Confiabilidade alta')).not.toBeInTheDocument();
    expect(screen.queryByText('Movimento 1')).not.toBeInTheDocument();
  });
  it('recomputes competing suggestions after confirmation and preserves unaffected results', async () => {
    data = makeData([item(1), item(3), item(5)]);
    const defaultPost = vi.mocked(api.post).getMockImplementation()!;
    vi.mocked(api.post).mockImplementation(async (url, body: any, config) => {
      if (String(url).endsWith('/suggestions/batch')) return { data: { results: body.itemIds.map((id: number) => ({ itemId: id,
        candidates: id === 3 && data.items[0].activeGroupId ? [] : [{ ...candidate(item(id)),
          transactions: id === 3 ? candidate(item(1)).transactions : candidate(item(id)).transactions }] })) } };
      return defaultPost(url, body, config);
    });
    await open(); fireEvent.click(selectAll());
    fireEvent.click((await screen.findAllByRole('button', { name: 'Revisar vínculo' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar vínculo' }));
    await screen.findByText('Sem correspondência encontrada');
    expect(screen.getAllByRole('button', { name: 'Revisar vínculo' })).toHaveLength(1);
    expect(vi.mocked(api.post).mock.calls.filter(([url]) => String(url).endsWith('/suggestions/batch')).map(([, body]: any) => body.itemIds)).toEqual([[1, 3, 5], [3]]);
  });
});
