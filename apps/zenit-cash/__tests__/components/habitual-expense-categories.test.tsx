import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HabitualExpenseCategories from '@/components/financial/HabitualExpenseCategories';
import {
  getHabitualExpensePreference,
  saveHabitualExpensePreference
} from '@/lib/habitual-expenses';

vi.mock('@/lib/habitual-expenses', () => ({
  getHabitualExpensePreference: vi.fn(),
  saveHabitualExpensePreference: vi.fn()
}));
const fixture = {
  configured: true,
  categoryIds: [1],
  access: { canRead: true, canManage: true },
  categories: [
    { id: 1, name: 'Restaurante', parentId: null, color: '#fff' },
    { id: 2, name: 'Oficina', parentId: null, color: '#fff' }
  ]
};
beforeEach(() => {
  vi.mocked(getHabitualExpensePreference).mockReset().mockResolvedValue(fixture);
  vi.mocked(saveHabitualExpensePreference).mockReset().mockResolvedValue(fixture);
});
describe('Habitual expense categories', () => {
  it('searches without losing selection and saves only through the explicit permanent action', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<HabitualExpenseCategories onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: 'Gerenciar categorias' }));
    const restaurant = await screen.findByRole('checkbox', { name: 'Restaurante' });
    expect(restaurant).toBeChecked();
    await user.type(screen.getByLabelText('Buscar categoria'), 'oficina');
    expect(screen.queryByRole('checkbox', { name: 'Restaurante' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Oficina' }));
    expect(saveHabitualExpensePreference).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Salvar categorias habituais' }));
    await waitFor(() => expect(saveHabitualExpensePreference).toHaveBeenCalledWith([1, 2]));
    expect(onSaved).toHaveBeenCalledOnce();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('discards unsaved changes and preserves a draft when saving fails', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    render(<HabitualExpenseCategories onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: 'Gerenciar categorias' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Restaurante' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(saveHabitualExpensePreference).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Gerenciar categorias' }));
    expect(await screen.findByRole('checkbox', { name: 'Restaurante' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Restaurante' }));
    vi.mocked(saveHabitualExpensePreference).mockRejectedValueOnce(new Error('offline'));
    await user.click(screen.getByRole('button', { name: 'Salvar categorias habituais' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Suas escolhas continuam aqui');
    expect(screen.getByRole('checkbox', { name: 'Restaurante' })).not.toBeChecked();
    expect(onSaved).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Salvar categorias habituais' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(saveHabitualExpensePreference).toHaveBeenLastCalledWith([]);
  });
  it('allows readers to inspect but not change workspace configuration', async () => {
    vi.mocked(getHabitualExpensePreference).mockResolvedValue({
      ...fixture,
      access: { canRead: true, canManage: false }
    });
    const user = userEvent.setup();
    render(<HabitualExpenseCategories onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Gerenciar categorias' }));
    expect(await screen.findByRole('checkbox', { name: 'Restaurante' })).toBeDisabled();
    expect(
      screen.queryByRole('button', { name: 'Salvar categorias habituais' })
    ).not.toBeInTheDocument();
  });
});
