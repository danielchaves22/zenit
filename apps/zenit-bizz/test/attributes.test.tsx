import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttributeEditor, ProductAttribute } from '@zenit/product-attributes';
import { CatalogItemForm } from '@/components/CatalogItemForm';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('next/router', () => ({
  useRouter: () => ({ beforePopState: vi.fn(), events: { on: vi.fn(), off: vi.fn() } })
}));
const global: ProductAttribute = {
  id: 'color',
  name: 'Cor',
  description: 'Cor do produto',
  type: 'SELECT',
  unit: '',
  active: true,
  version: 1,
  revision: 'revision',
  scope: 'global',
  options: [
    { id: 'white', label: 'Branco', active: true, scope: 'global' },
    { id: 'blue', label: 'Azul', active: true, scope: 'company' }
  ]
};
beforeEach(() => vi.clearAllMocks());
describe('Shared attribute editor', () => {
  it('offers only company options when editing a global attribute from Bizz', async () => {
    const save = vi.fn().mockResolvedValue(global);
    render(
      <AttributeEditor
        item={global}
        platform={false}
        api={save}
        protect={vi.fn()}
        back={vi.fn()}
        saved={vi.fn()}
      />
    );
    expect(screen.queryByLabelText(/Nome/)).not.toBeInTheDocument();
    expect(screen.getByText('Branco')).toBeVisible();
    expect(screen.getByText('Azul')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar valor/ }));
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: 'Rosa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar valor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [path, options] = save.mock.calls[0];
    expect(path).toBe('/color/options');
    expect(JSON.parse(options.body)).toEqual({
      revision: 'revision',
      options: [
        { id: 'blue', label: 'Azul', active: true },
        { label: 'Rosa', active: true }
      ]
    });
  });
  it('keeps unsaved options and request key on network failure', async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error('Conexão interrompida'))
      .mockResolvedValue(global);
    const protect = vi.fn();
    render(
      <AttributeEditor
        item={null}
        platform
        api={call}
        protect={protect}
        back={vi.fn()}
        saved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Cor' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar valor/ }));
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: 'Azul' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar valor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida');
    expect(screen.getByText('Azul')).toBeVisible();
    expect(protect).toHaveBeenLastCalledWith(true, false);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(2));
    expect(JSON.parse(call.mock.calls[0][1].body).requestKey).toBe(
      JSON.parse(call.mock.calls[1][1].body).requestKey
    );
  });
  it('Admin edits global options and existing options can be inactivated', async () => {
    const call = vi.fn().mockResolvedValue(global);
    render(
      <AttributeEditor
        item={global}
        platform
        api={call}
        protect={vi.fn()}
        back={vi.fn()}
        saved={vi.fn()}
      />
    );
    expect(screen.getByText('Branco')).toBeVisible();
    expect(screen.queryByDisplayValue('Azul')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inativar valor Branco' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(call).toHaveBeenCalled());
    expect(JSON.parse(call.mock.calls[0][1].body)).toMatchObject({
      version: 1,
      options: [{ id: 'white', label: 'Branco', active: false }]
    });
  });
});
describe('Optional product values', () => {
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
    attributes: [
      { attributeId: global.id, optionId: 'white', attribute: global, option: global.options[0] }
    ]
  };
  it('retains inactive existing values and excludes presentation fields from the save payload', async () => {
    vi.mocked(api).mockImplementation(async (path, options) => {
      if (path.startsWith('/bizz/attributes'))
        return { ...global, active: false, options: [{ ...global.options[0], active: false }] };
      return item;
    });
    const saved = vi.fn();
    render(<CatalogItemForm item={item} companyId={1} onClose={vi.fn()} onSaved={saved} />);
    await screen.findByText(/Característica inativa/);
    expect(screen.getByRole('button', { name: 'Editar Cor' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const call = vi.mocked(api).mock.calls.find(([, o]) => o?.method === 'PUT')!;
    expect(JSON.parse(call[1]!.body as string).attributes).toEqual([
      { attributeId: 'color', optionId: 'white' }
    ]);
  });
  it('retains current assignment when loading definitions fails', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Falha ao carregar valores'));
    render(<CatalogItemForm item={item} companyId={1} onClose={vi.fn()} onSaved={vi.fn()} />);
    await screen.findByText('Falha ao carregar valores');
    expect(screen.getByText('Branco')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Editar Cor' })).toBeDisabled();
  });
  it('protects attribute removal with the same unsaved navigation confirmation as the product', async () => {
    vi.mocked(api).mockResolvedValue(global);
    const close = vi.fn();
    render(
      <NavigationProvider>
        <CatalogItemForm item={item} companyId={1} onClose={close} onSaved={vi.fn()} />
      </NavigationProvider>
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Editar Cor' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Remover Cor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(close).not.toHaveBeenCalled();
  });
});
