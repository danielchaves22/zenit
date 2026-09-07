import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    await open(); fireEvent.click(selectAll());
    fireEvent.click(screen.getByRole('button', { name: 'Buscar correspondências' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buscar correspondências' })).toBeEnabled());
    const calls = vi.mocked(api.post).mock.calls;
    expect(calls).toHaveLength(10);
    expect(calls.every(([url, body]) => String(url).endsWith('/suggestions/batch') && (body as any).itemIds.length === 5)).toBe(true);
    expect(calls.flatMap(([, body]) => (body as any).itemIds)).toEqual(data.items.map(i => i.id));
    expect(screen.getAllByRole('button', { name: 'Revisar vínculo' })).toHaveLength(50);
    expect(screen.queryByRole('button', { name: 'Sugerir com IA' })).not.toBeInTheDocument();
  }, 15000);
  it('keeps the remaining suggestions after confirming one candidate and sends its own cache reference', async () => {
    await open(); fireEvent.click(selectAll()); fireEvent.click(screen.getByRole('button', { name: 'Buscar correspondências' }));
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
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(api.post).not.toHaveBeenCalled();
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
  });
});
