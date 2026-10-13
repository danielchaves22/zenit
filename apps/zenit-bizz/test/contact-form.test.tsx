import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactForm } from '@/components/ContactForm';
import { api } from '@/lib/api';
import { Contact } from '@/lib/types';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe('contact form recovery', () => {
  it('saves an unclassified person with an optional address', async () => {
    vi.mocked(api).mockResolvedValue({ id: 'saved' });
    const saved = vi.fn();
    render(<ContactForm contact={null} companyId={23} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), { target: { value: 'Ana' } });
    fireEvent.click(screen.getByText('Endereço'));
    fireEvent.change(screen.getByLabelText('Logradouro'), { target: { value: 'Rua das Flores' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Campinas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toMatchObject({
      name: 'Ana',
      isCustomer: false,
      isSupplier: false,
      street: 'Rua das Flores',
      city: 'Campinas'
    });
  });
  it('preserves an existing relationship even when opened from another filter', () => {
    const contact = {
      id: 'existing',
      name: 'Ana',
      personType: 'PERSON',
      isCustomer: false,
      isSupplier: false,
      active: true,
      version: 1
    } as Contact;
    render(
      <ContactForm
        contact={contact}
        role="supplier"
        personType="BUSINESS"
        companyId={23}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Fornecedor')).not.toBeChecked();
    expect(screen.getByLabelText('Cliente')).not.toBeChecked();
    expect(screen.getByLabelText('Tipo de pessoa')).toHaveValue('PERSON');
  });
  it('prefills both relationships for a new company in the combined filter', () => {
    render(
      <ContactForm
        contact={null}
        role="both"
        personType="BUSINESS"
        companyId={23}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Cliente')).toBeChecked();
    expect(screen.getByLabelText('Fornecedor')).toBeChecked();
    expect(screen.getByLabelText('Tipo de pessoa')).toHaveValue('BUSINESS');
  });
  it('retains entered data and reuses its request key after a failed response', async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error('Conexão interrompida.'))
      .mockResolvedValueOnce({ id: 'saved' });
    const saved = vi.fn();
    render(
      <ContactForm
        contact={null}
        role="supplier"
        companyId={23}
        onClose={vi.fn()}
        onSaved={saved}
      />
    );
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), {
      target: { value: 'Flores da Serra' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/Nome ou razão social/)).toHaveValue('Flores da Serra');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
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
    render(
      <ContactForm contact={null} role="customer" companyId={1} onClose={close} onSaved={vi.fn()} />
    );
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), { target: { value: 'Maria' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText(/Nome ou razão social/)).toHaveValue('Maria');
  });
});
