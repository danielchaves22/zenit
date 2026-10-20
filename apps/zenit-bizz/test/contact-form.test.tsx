import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactForm } from '@/components/ContactForm';
import { api } from '@/lib/api';
import { Contact } from '@/lib/types';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe('contact form recovery', () => {
  it('saves an unclassified person with an optional address', async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === '/bizz/geography/states') return [{ code: 'SP', name: 'São Paulo', id: 35 }];
      if (path === '/bizz/geography/states/SP/cities')
        return [{ code: '3509502', name: 'Campinas', stateCode: 'SP' }];
      return { id: 'saved' } as never;
    });
    const saved = vi.fn();
    render(<ContactForm contact={null} companyId={23} onClose={vi.fn()} onSaved={saved} />);
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), {
      target: { value: 'Ana' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar endereço' }));
    fireEvent.change(screen.getByLabelText('Logradouro'), {
      target: { value: 'Rua das Flores' }
    });
    await screen.findByRole('option', { name: 'São Paulo (SP)' });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'SP' } });
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Cidade' })).toBeEnabled());
    fireEvent.click(screen.getByRole('combobox', { name: 'Cidade' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar cidade' }), {
      target: { value: 'camp' }
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Buscar cidade' }), {
      key: 'Enter'
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    expect(
      JSON.parse(
        vi.mocked(api).mock.calls.find(([, options]) => options?.method === 'POST')![1]!
          .body as string
      )
    ).toMatchObject({
      name: 'Ana',
      isCustomer: false,
      isSupplier: false,
      addresses: [{ street: 'Rua das Flores', location: { stateCode: 'SP', cityCode: '3509502' } }]
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
    fireEvent.click(screen.getByRole('button', { name: /Relacionamento/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /Relacionamento/ }));
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
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), {
      target: { value: 'Maria' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText(/Nome ou razão social/)).toHaveValue('Maria');
  });
  it('selects both relationships, closes with Escape and restores focus without losing the selection', () => {
    render(<ContactForm contact={null} companyId={23} onClose={vi.fn()} onSaved={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: /Relacionamento/ });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByLabelText('Cliente')).toHaveFocus();
    fireEvent.click(screen.getByLabelText('Cliente'));
    fireEvent.click(screen.getByLabelText('Fornecedor'));
    fireEvent.keyDown(screen.getByLabelText('Fornecedor'), { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Cliente, Fornecedor');
    fireEvent.click(trigger);
    expect(screen.getByLabelText('Cliente')).toBeChecked();
    expect(screen.getByLabelText('Fornecedor')).toBeChecked();
    fireEvent.pointerDown(document.body);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
  it('adds and removes contact values and submits every filled row while preserving data after failure', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Conexão interrompida.'));
    render(<ContactForm contact={null} companyId={23} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), {
      target: { value: 'Ana' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar telefone' }));
    fireEvent.change(screen.getByLabelText('Telefone 1'), {
      target: { value: '11999990001' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar telefone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar telefone' }));
    expect(screen.getByLabelText('Telefone 2')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Telefone 2'), {
      target: { value: '11999990002' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar telefone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar e-mail' }));
    fireEvent.change(screen.getByLabelText('E-mail 1'), {
      target: { value: 'ana@example.test' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar e-mail' }));
    fireEvent.change(screen.getByLabelText('E-mail 2'), {
      target: { value: 'outro@example.test' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('alert');
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toMatchObject({
      phones: ['11999990001', '11999990002'],
      emails: ['ana@example.test', 'outro@example.test']
    });
    expect(screen.getByText('(11) 99999-0002')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remover telefone 1' }));
    expect(screen.getByText('(11) 99999-0002')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Adicionar telefone' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('heading', { name: 'Descartar alterações?' })).toBeInTheDocument();
  });
  it('loads legacy values and submits empty lists when the last values are removed', async () => {
    vi.mocked(api).mockResolvedValue({ id: 'saved' });
    const contact = {
      id: 'saved',
      name: 'Ana',
      email: 'ana@example.test',
      phone: '11999990001',
      version: 2
    } as Contact;
    render(<ContactForm contact={contact} companyId={23} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByText('(11) 99999-0001')).toBeVisible();
    expect(screen.getByText(contact.email!)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remover telefone 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remover e-mail 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toMatchObject({
      phones: [],
      emails: [],
      version: 2
    });
  });
});
