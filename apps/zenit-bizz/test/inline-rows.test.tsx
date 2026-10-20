import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttributeEditor, ProductAttribute } from '@zenit/product-attributes';
import { ContactForm } from '@/components/ContactForm';
import { CatalogItemForm } from '@/components/CatalogItemForm';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { Contact } from '@/lib/types';

vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('next/router', () => ({
  useRouter: () => ({ beforePopState: vi.fn(), events: { on: vi.fn(), off: vi.fn() } })
}));
beforeEach(() => vi.resetAllMocks());
const contact = {
  id: 'person',
  name: 'Ana',
  personType: 'PERSON',
  active: true,
  version: 1,
  emails: ['ana@example.test'],
  phones: ['11999990001']
} as Contact;
const number: ProductAttribute = {
  id: 'height',
  name: 'Altura',
  type: 'NUMBER',
  unit: 'cm',
  description: '',
  active: true,
  scope: 'company',
  version: 1,
  revision: '',
  options: []
};

describe('inline value drafts', () => {
  it('confirms with Enter, rejects duplicate emails and cancels edits without changing the row', async () => {
    vi.mocked(api).mockResolvedValue(contact);
    render(<ContactForm contact={contact} companyId={1} onSaved={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('E-mail 1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar e-mail' }));
    fireEvent.change(screen.getByLabelText('E-mail 2'), { target: { value: 'ANA@example.test' } });
    fireEvent.keyDown(screen.getByLabelText('E-mail 2'), { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent('repetido');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(api).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('E-mail 2'), {
      target: { value: 'compras@example.test' }
    });
    fireEvent.keyDown(screen.getByLabelText('E-mail 2'), { key: 'Enter' });
    expect(screen.getByText('compras@example.test')).toBeVisible();
    expect(api).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Editar e-mail 1' }));
    fireEvent.change(screen.getByLabelText('E-mail 1'), {
      target: { value: 'alterado@example.test' }
    });
    fireEvent.keyDown(screen.getByLabelText('E-mail 1'), { key: 'Escape' });
    expect(screen.getByText('ana@example.test')).toBeVisible();
    expect(screen.queryByText('alterado@example.test')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api).toHaveBeenCalledOnce());
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string).emails).toEqual([
      'ana@example.test',
      'compras@example.test'
    ]);
  });

  it('retains an unconfirmed field after declining to discard and does not submit invalid email', () => {
    const close = vi.fn();
    render(<ContactForm contact={contact} companyId={1} onSaved={vi.fn()} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar e-mail' }));
    fireEvent.change(screen.getByLabelText('E-mail 2'), { target: { value: 'invalido' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }));
    expect(screen.getByLabelText('E-mail 2')).toBeInvalid();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByLabelText('E-mail 2')).toHaveValue('invalido');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar e-mail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(close).toHaveBeenCalledOnce();
    expect(api).not.toHaveBeenCalled();
  });

  it('validates global collisions locally and protects a pending option before it becomes a row', () => {
    const protect = vi.fn();
    const call = vi.fn();
    render(
      <AttributeEditor
        item={{
          ...number,
          id: 'color',
          name: 'Cor',
          type: 'SELECT',
          scope: 'global',
          options: [{ id: 'white', label: 'Branco', scope: 'global', active: true }]
        }}
        platform={false}
        api={call}
        protect={protect}
        back={vi.fn()}
        saved={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Adicionar valor/ }));
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: 'bránco' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar valor' }));
    expect(screen.getByRole('alert')).toHaveTextContent('já está cadastrado');
    expect(protect).toHaveBeenLastCalledWith(true, false);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.keyDown(screen.getByLabelText('Valor'), { key: 'Escape' });
    expect(protect).toHaveBeenLastCalledWith(false, false);
    expect(call).not.toHaveBeenCalled();
  });

  it('keeps a numeric assignment precise and blocks whole-form saving until the row is confirmed', async () => {
    const item = {
      id: 'product',
      name: 'Rosa',
      kind: 'PRODUCT' as const,
      unit: 'Unidade',
      canPurchase: true,
      canSell: true,
      salePrice: null,
      active: true,
      version: 1,
      attributes: [{ attributeId: 'height', numberValue: '35.5', attribute: number }]
    };
    vi.mocked(api).mockImplementation(async (_, options) =>
      options?.method === 'PUT' ? item : number
    );
    render(
      <NavigationProvider>
        <CatalogItemForm item={item} companyId={1} onSaved={vi.fn()} onClose={vi.fn()} />
      </NavigationProvider>
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Editar Altura' })).toBeEnabled()
    );
    expect(screen.getByText('35,5 cm')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Editar Altura' }));
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar característica' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Informe um número');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Altura (cm)'), {
      target: { value: '123456789012,123456' }
    });
    fireEvent.keyDown(screen.getByLabelText('Altura (cm)'), { key: 'Enter' });
    expect(screen.getByText('123456789012,123456 cm')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(vi.mocked(api).mock.calls.some(([, o]) => o?.method === 'PUT')).toBe(true)
    );
    const call = vi.mocked(api).mock.calls.find(([, o]) => o?.method === 'PUT')!;
    expect(JSON.parse(call[1]!.body as string).attributes).toEqual([
      { attributeId: 'height', numberValue: '123456789012.123456' }
    ]);
  });
});
