import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ContactForm } from '@/components/ContactForm';
import { Contact, ContactAddress } from '@/lib/types';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const first: ContactAddress = {
  id: '98f66cb3-1013-4abc-8033-104cb769e001',
  label: 'Comercial',
  postalCode: null,
  street: 'Rua das Flores',
  addressNumber: '10',
  complement: null,
  neighborhood: null,
  city: 'Campinas',
  state: 'SP',
  country: 'Brasil',
  location: { stateCode: 'SP', cityCode: '3509502' }
};
const second: ContactAddress = {
  ...first,
  id: '98f66cb3-1013-4abc-8033-104cb769e002',
  label: 'Entrega',
  street: 'Rua Nova'
};
const contact = {
  id: 'person',
  name: 'Ana',
  personType: 'PERSON',
  isCustomer: true,
  isSupplier: true,
  active: true,
  version: 3,
  addresses: [first, second]
} as Contact;
function writes() {
  return vi
    .mocked(api)
    .mock.calls.filter(([, options]) => options?.method === 'PUT' || options?.method === 'POST');
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith('/states')) return [{ id: 35, code: 'SP', name: 'São Paulo' }] as never;
    if (path.endsWith('/cities'))
      return [{ code: '3509502', name: 'Campinas', stateCode: 'SP' }] as never;
    throw new Error('Conexão interrompida.');
  });
});
describe('multiple contact addresses', () => {
  it('adds independent addresses, preserves them on failure and sends an ordered list without UI keys', async () => {
    render(<ContactForm contact={null} companyId={23} onSaved={vi.fn()} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nome ou razão social/), {
      target: { value: 'Ana' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar endereço' }));
    let card = within(screen.getByRole('group', { name: 'Endereço 1' }));
    expect(card.getByLabelText('Identificação')).toHaveFocus();
    fireEvent.change(card.getByLabelText('Identificação'), { target: { value: 'Comercial' } });
    fireEvent.change(card.getByLabelText('Logradouro'), { target: { value: 'Rua A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar endereço' }));
    card = within(screen.getByRole('group', { name: 'Endereço 2' }));
    expect(card.getByLabelText('Identificação')).toHaveFocus();
    fireEvent.change(card.getByLabelText('Identificação'), { target: { value: 'Entrega' } });
    fireEvent.change(card.getByLabelText('Logradouro'), { target: { value: 'Rua B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Conexão interrompida.');
    const payload = JSON.parse(writes()[0][1]!.body as string);
    expect(payload.addresses).toMatchObject([
      { label: 'Comercial', street: 'Rua A' },
      { label: 'Entrega', street: 'Rua B' }
    ]);
    expect(payload.addresses.every((value: object) => !('key' in value))).toBe(true);
    expect(screen.getByText('Rua A')).toBeVisible();
    expect(screen.getByText('Rua B')).toBeVisible();
  });
  it('changes the primary without losing IDs, confirms removal and submits no addresses when all are removed', async () => {
    const saved = vi.fn();
    render(<ContactForm contact={contact} companyId={23} onSaved={saved} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar endereço 2' }));
    fireEvent.click(screen.getByLabelText('Endereço principal'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByText('Conexão interrompida.');
    expect(
      JSON.parse(writes()[0][1]!.body as string).addresses.map((value: ContactAddress) => value.id)
    ).toEqual([second.id, first.id]);
    fireEvent.click(screen.getByRole('button', { name: 'Remover endereço 1' }));
    expect(screen.getByRole('button', { name: 'Manter endereço' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Manter endereço' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Remover endereço 1' })).toHaveFocus()
    );
    expect(screen.getByText('Entrega')).toBeVisible();
    for (let remaining = 2; remaining > 0; remaining--) {
      fireEvent.click(screen.getByRole('button', { name: 'Remover endereço 1' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    }
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Adicionar endereço' })).toHaveFocus()
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(JSON.parse(writes()[1][1]!.body as string).addresses).toEqual([]);
  });
  it('does not mark a loaded record dirty and protects changes to additional addresses', async () => {
    const close = vi.fn();
    render(<ContactForm contact={contact} companyId={23} onSaved={vi.fn()} onClose={close} />);
    expect(screen.getAllByText(/Campinas/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(close).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Editar endereço 2' }));
    fireEvent.change(
      within(screen.getByRole('group', { name: 'Endereço 2' })).getByLabelText('Logradouro'),
      { target: { value: 'Rua Alterada' } }
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('heading', { name: 'Descartar alterações?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(
      within(screen.getByRole('group', { name: 'Endereço 2' })).getByLabelText('Logradouro')
    ).toHaveValue('Rua Alterada');
  });
});
