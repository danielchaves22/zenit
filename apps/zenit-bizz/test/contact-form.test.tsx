import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactForm } from '@/components/ContactForm';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe('contact form recovery', () => {
  it('retains entered data and reuses its request key after a failed response', async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error('Conexão interrompida.'))
      .mockResolvedValueOnce({ id: 'saved' });
    const saved = vi.fn();
    render(<ContactForm contact={null} role="supplier" companyId={23} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), { target: { value: 'Flores da Serra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/Nome ou razão social/)).toHaveValue('Flores da Serra');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar cadastro' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const first = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
    const second = JSON.parse(vi.mocked(api).mock.calls[1][1]!.body as string);
    expect(first.requestKey).toBeTruthy();
    expect(first.requestKey).toBe(second.requestKey);
    expect(first.isSupplier).toBe(true);
    expect(first).not.toHaveProperty('companyId');
    expect(vi.mocked(api).mock.calls[0][1]?.companyId).toBe(23);
  });
  it('asks before discarding an unsaved contact', async () => {
    const close = vi.fn();
    render(<ContactForm contact={null} role="customer" companyId={1} onClose={close} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText(/Nome ou razão social/)).toHaveValue('Maria');
  });
});
