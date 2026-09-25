import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FinancialForecast from '@/components/financial/FinancialForecast';
import {
  defaultForecastOptions,
  FinancialForecast as ForecastData,
  getFinancialForecast
} from '@/lib/financial-forecast';

vi.mock('@/lib/financial-forecast', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/financial-forecast')>()),
  getFinancialForecast: vi.fn()
}));
const fetchForecast = vi.mocked(getFinancialForecast);
const fixture: ForecastData = {
  month: '2026-09',
  currentMonth: '2026-09',
  maximumMonth: '2028-09',
  isCurrentMonth: true,
  options: defaultForecastOptions,
  currentBalance: '1000.00',
  openingBalance: '1000.00',
  endingBalance: '950.00',
  income: '500.00',
  expense: '550.00',
  result: '-50.00',
  remainingIncome: '500.00',
  remainingExpense: '550.00',
  sources: [
    { key: 'income', included: true, income: '500.00', expense: '0.00' },
    { key: 'fixed', included: true, income: '0.00', expense: '100.00' },
    { key: 'other', included: true, income: '0.00', expense: '200.00' },
    { key: 'cards', included: true, income: '0.00', expense: '100.00' },
    { key: 'variable', included: true, income: '0.00', expense: '150.00' }
  ],
  incomes: [
    { id: 10, description: 'Salário', amount: '300.00', included: true },
    { id: 20, description: 'Aluguel recebido', amount: '200.00', included: true }
  ],
  history: { months: ['2026-07', '2026-08'], requestedMonths: 6, uncategorizedCount: 0 },
  variables: [
    {
      key: 'ACCOUNT:1',
      categoryId: 1,
      categoryName: 'Restaurante',
      channel: 'ACCOUNT',
      accountName: null,
      historicalAverage: '500.00',
      expectedAmount: '500.00',
      committedInMonth: '350.00',
      remainingProjected: '150.00',
      included: true,
      cycleUnavailable: false,
      adjusted: false,
      history: [
        { month: '2026-07', amount: '600.00' },
        { month: '2026-08', amount: '400.00' }
      ]
    }
  ],
  transactions: [],
  overdue: { included: false, cashEffect: '0.00', income: '0.00', expense: '0.00', items: [] },
  cardsWithoutCycle: [],
  timeline: [
    {
      month: '2026-09',
      income: '500.00',
      expense: '550.00',
      result: '-50.00',
      endingBalance: '950.00'
    }
  ]
};
beforeEach(() => {
  fetchForecast.mockReset();
  fetchForecast.mockImplementation(async (month, options) => ({
    ...fixture,
    month: month ?? fixture.month,
    options,
    incomes: fixture.incomes.map((income) => ({
      ...income,
      included: options.sources.income && !options.excludedIncomeIds.includes(income.id)
    })),
    sources: fixture.sources.map((source) => ({ ...source, included: options.sources[source.key] }))
  }));
});

describe('Financial forecast', () => {
  it('emphasizes monthly deficit, keeps cash secondary, and hides averages until details are opened', async () => {
    const user = userEvent.setup();
    render(<FinancialForecast />);
    expect(await screen.findByText('Déficit previsto no mês')).toBeVisible();
    expect(screen.getByText('Saldo acumulado neste cenário')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Mês anterior' })).toBeDisabled();
    expect(screen.getByText('Médias por categoria')).not.toBeVisible();
    await user.click(screen.getByText('Ver detalhes e ajustar projeções'));
    expect(screen.getByText('Médias por categoria')).toBeVisible();
    expect(screen.getByLabelText('Histórico utilizado')).toHaveValue('6');
  });

  it('sends source choices and invoice mode to the scenario without resetting them on month change', async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    render(<FinancialForecast onMonthChange={onMonthChange} />);
    await screen.findByText('Déficit previsto no mês');
    await user.click(screen.getByRole('checkbox', { name: /Outras despesas/ }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[1].sources.other).toBe(false));
    await user.click(screen.getByText('Ver detalhes e ajustar projeções'));
    await user.selectOptions(screen.getByLabelText('Projeção dos cartões'), 'KNOWN_ONLY');
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[1].cardMode).toBe('KNOWN_ONLY'));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[0]).toBe('2026-10'));
    expect(fetchForecast.mock.lastCall?.[1].sources.other).toBe(false);
    expect(onMonthChange).toHaveBeenCalledWith('2026-10');
  });

  it('applies manual values only after the explicit scenario action and can restore defaults', async () => {
    const user = userEvent.setup();
    render(<FinancialForecast />);
    await screen.findByText('Déficit previsto no mês');
    await user.click(screen.getByText('Ver detalhes e ajustar projeções'));
    fireEvent.input(screen.getByLabelText('Estimativa mensal de Restaurante (fora do cartão)'), {
      target: { value: '400,00' }
    });
    expect(fetchForecast).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Aplicar ajustes ao cenário' }));
    await waitFor(() =>
      expect(fetchForecast.mock.lastCall?.[1].overrides['ACCOUNT:1']).toBe('400.00')
    );
    await user.click(screen.getByRole('button', { name: 'Restaurar cenário completo' }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[1]).toEqual(defaultForecastOptions));
  });

  it('opens the income choices inline, toggles one source, and keeps the selection across months', async () => {
    const user = userEvent.setup();
    render(<FinancialForecast />);
    await screen.findByText('Déficit previsto no mês');
    expect(screen.getByText('Salário')).not.toBeVisible();
    const sourceGroup = screen.getByText('Ver receitas').closest('details')!.parentElement!;
    expect(sourceGroup).toContainElement(screen.getByRole('checkbox', { name: /Receitas fixas/ }));
    await user.click(screen.getByText('Ver receitas'));
    expect(screen.getByText('Salário')).toBeVisible();
    expect(screen.getByText('Médias por categoria')).not.toBeVisible();
    await user.click(screen.getByRole('checkbox', { name: /Salário/ }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[1].excludedIncomeIds).toEqual([10]));
    expect(fetchForecast.mock.lastCall?.[1].sources.fixed).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[0]).toBe('2026-10'));
    expect(screen.getByRole('checkbox', { name: /Salário/ })).not.toBeChecked();
    expect(fetchForecast.mock.lastCall?.[1].excludedIncomeIds).toEqual([10]);
    await user.click(screen.getByRole('checkbox', { name: /Salário/ }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[1].excludedIncomeIds).toEqual([]));
  });

  it('switches off fixed income independently and retains individual choices when switched back on', async () => {
    const user = userEvent.setup();
    render(<FinancialForecast />);
    await screen.findByText('Déficit previsto no mês');
    await user.click(screen.getByText('Ver receitas'));
    await user.click(screen.getByRole('checkbox', { name: /Salário/ }));
    await user.click(screen.getByRole('checkbox', { name: /Receitas fixas/ }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[1].sources.income).toBe(false));
    expect(screen.getByRole('checkbox', { name: /Aluguel recebido/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Despesas fixas/ })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Receitas fixas/ }));
    await waitFor(() => expect(fetchForecast.mock.lastCall?.[1].sources.income).toBe(true));
    expect(screen.getByRole('checkbox', { name: /Salário/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Aluguel recebido/ })).toBeChecked();
  });

  it('shows an error instead of presenting an old result as the new scenario and supports retry', async () => {
    const user = userEvent.setup();
    render(<FinancialForecast />);
    await screen.findByText('Déficit previsto no mês');
    fetchForecast.mockRejectedValueOnce(new Error('Network failure'));
    await user.click(screen.getByRole('button', { name: 'Próximo mês' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível calcular');
    expect(screen.queryByText('Déficit previsto no mês')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Déficit previsto no mês')).toBeVisible();
  });
});
