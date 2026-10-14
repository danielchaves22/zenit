import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactLocation } from '@/components/ContactLocation';
import { ContactForm } from '@/components/ContactForm';
import { api } from '@/lib/api';
import { BrazilLocation, Contact, GeographyCity } from '@/lib/types';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const states = [
  { code: 'SP', name: 'São Paulo', id: 35 },
  { code: 'RJ', name: 'Rio de Janeiro', id: 33 }
];
const campinas = { code: '3509502', name: 'Campinas', stateCode: 'SP' };
const rio = { code: '3304557', name: 'Rio de Janeiro', stateCode: 'RJ' };
beforeEach(() => vi.resetAllMocks());
function Field() {
  const [value, setValue] = useState<BrazilLocation>({
    stateCode: 'SP',
    cityCode: campinas.code
  });
  return (
    <>
      <ContactLocation
        value={value}
        onChange={setValue}
        contact={null}
        companyId={23}
        disabled={false}
        enabled
      />
      <output>{JSON.stringify(value)}</output>
    </>
  );
}
describe('contact location selection', () => {
  it('clears the city when changing the state, filters by name and supports Escape and selection by keyboard', async () => {
    vi.mocked(api).mockImplementation(
      async (path) =>
        (path.endsWith('/states')
          ? states
          : path.includes('/SP/')
            ? [campinas]
            : [rio]) as never
    );
    render(<Field />);
    await screen.findByText('Campinas');
    fireEvent.click(screen.getByRole('combobox', { name: 'Cidade' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar cidade' }), { target: { value: 'inexistente' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Buscar cidade' }), { key: 'Enter' });
    expect(screen.getByText('Nenhuma cidade encontrada.')).toBeInTheDocument();
    expect(screen.getByText(JSON.stringify({ stateCode: 'SP', cityCode: campinas.code }))).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Buscar cidade' }), { key: 'Escape' });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'RJ' } });
    expect(screen.getByRole('status')).toHaveTextContent('"cityCode":null');
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Cidade' })).toBeEnabled());
    const trigger = screen.getByRole('combobox', { name: 'Cidade' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const search = screen.getByRole('combobox', { name: 'Buscar cidade' });
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: 'rio' } });
    expect(screen.queryByRole('option', { name: 'Campinas' })).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar cidade' }), {
      target: { value: 'rio' }
    });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Buscar cidade' }), {
      key: 'Enter'
    });
    expect(screen.getByRole('status')).toHaveTextContent(rio.code);
    expect(trigger).toHaveTextContent('Rio de Janeiro');
  });
  it('ignores a stale city response and lets a failed request be retried', async () => {
    let resolveSP: (cities: GeographyCity[]) => void = () => {};
    const pendingSP = new Promise<GeographyCity[]>((resolve) => {
      resolveSP = resolve;
    });
    let fail = false;
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith('/states')) return states as never;
      if (path.includes('/SP/')) return pendingSP as never;
      if (fail) throw new Error('Offline');
      return [rio] as never;
    });
    const props = {
      companyId: 23,
      onChange: vi.fn(),
      contact: null,
      disabled: false,
      enabled: true
    };
    const view = render(
      <ContactLocation {...props} value={{ stateCode: 'SP', cityCode: campinas.code }} />
    );
    view.rerender(
      <ContactLocation {...props} value={{ stateCode: 'RJ', cityCode: rio.code }} />
    );
    await screen.findByText('Rio de Janeiro');
    await act(async () => resolveSP([campinas]));
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toHaveTextContent(
      'Rio de Janeiro'
    );
    fail = true;
    view.rerender(
      <ContactLocation
        {...props}
        companyId={24}
        value={{ stateCode: 'RJ', cityCode: rio.code }}
      />
    );
    await screen.findByRole('alert');
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toBeDisabled();
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toBeEnabled();
  });
  it('reloads multiple emails and a selected city without changing the record merely by opening it', async () => {
    vi.mocked(api).mockImplementation(
      async (path) => (path.endsWith('/states') ? states : [campinas]) as never
    );
    const close = vi.fn();
    const contact = {
      id: 'contact',
      name: 'Ana',
      personType: 'PERSON',
      isCustomer: true,
      isSupplier: false,
      city: 'Campinas',
      state: 'SP',
      country: 'Brasil',
      location: { stateCode: 'SP', cityCode: campinas.code },
      emails: ['ana@example.test', 'compras@example.test'],
      phones: ['1134567890'],
      version: 3,
      active: true
    } as Contact;
    render(<ContactForm contact={contact} companyId={23} onClose={close} onSaved={vi.fn()} />);
    await screen.findByText('Campinas');
    expect(screen.getByLabelText('E-mail 1')).toHaveValue(contact.emails![0]);
    expect(screen.getByLabelText('E-mail 2')).toHaveValue(contact.emails![1]);
    expect(screen.getByLabelText('Telefone 1')).toHaveValue('(11) 3456-7890');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
