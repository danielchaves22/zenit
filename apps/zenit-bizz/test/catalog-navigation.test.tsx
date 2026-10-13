import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogItems } from '@/components/CatalogItems';
import { CatalogItemPage } from '@/components/CatalogItemPage';
import { api } from '@/lib/api';
const state = vi.hoisted(() => ({
  company: { id: 23 },
  router: { isReady: true, query: {} as Record<string, string>, replace: vi.fn(), push: vi.fn() },
  complete: vi.fn((action: () => void) => action()),
  setNotice: vi.fn(),
  notice: ''
}));
vi.mock('next/router', () => ({ useRouter: () => state.router }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ company: state.company }) }));
vi.mock('@/contexts/NavigationContext', () => ({ useNavigation: () => state }));
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/components/Layout', async () => {
  const { Breadcrumb } = await import('@/components/Breadcrumb');
  return {
    Layout: ({ children, breadcrumbs }: any) => (
      <>
        <Breadcrumb items={breadcrumbs} />
        {children}
      </>
    )
  };
});
vi.mock('@/components/CatalogItemForm', () => ({
  CatalogItemForm: ({ item, companyId, onSaved }: any) => (
    <div>
      <span>
        {companyId}: {item?.name}
      </span>
      <button onClick={() => onSaved(item)}>Salvar</button>
    </div>
  )
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.company = { id: 23 };
  state.router.query = {};
});
describe('catalog navigation and list', () => {
  it('preserves filters in links and resets pagination when a filter changes', async () => {
    state.router.query = {
      q: 'Flor',
      kind: 'PRODUCT',
      usage: 'both',
      status: 'inactive',
      page: '2'
    };
    vi.mocked(api).mockResolvedValue({
      items: [
        {
          id: 'item',
          name: 'Flor',
          kind: 'PRODUCT',
          unit: 'Unidade',
          canPurchase: true,
          canSell: true,
          salePrice: '12.50',
          active: false
        }
      ],
      total: 21
    });
    render(<CatalogItems />);
    expect(await screen.findByRole('link', { name: 'Flor' })).toHaveAttribute(
      'href',
      '/produtos-servicos/item?q=Flor&kind=PRODUCT&usage=both&status=inactive&page=2'
    );
    expect(screen.getByText('R$ 12,50')).toBeVisible();
    expect(api).toHaveBeenCalledWith(
      '/bizz/catalog?q=Flor&kind=PRODUCT&usage=both&status=inactive&page=2',
      expect.objectContaining({ companyId: 23 })
    );
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SERVICE' } });
    expect(state.router.replace).toHaveBeenCalledWith(
      {
        pathname: '/produtos-servicos',
        query: { ...state.router.query, kind: 'SERVICE', page: '1' }
      },
      undefined,
      { shallow: true, scroll: false }
    );
  });
  it('shows recovery for a failed list and an empty result after retry', async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error('Falha de conexão.'))
      .mockResolvedValueOnce({ items: [], total: 0 });
    render(<CatalogItems />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de conexão.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await screen.findByRole('heading', { name: 'Nenhum produto ou serviço encontrado' });
  });
  it('loads the scoped edit page, keeps its breadcrumb and returns to the same list context', async () => {
    state.router.query = {
      id: 'item',
      q: 'Frete',
      kind: 'SERVICE',
      usage: 'purchase',
      status: 'inactive',
      page: '2'
    };
    vi.mocked(api).mockResolvedValue({ id: 'item', name: 'Frete' });
    render(<CatalogItemPage editing />);
    await screen.findByText('23: Frete');
    expect(screen.getByRole('link', { name: 'Produtos e serviços' })).toHaveAttribute(
      'href',
      '/produtos-servicos?q=Frete&kind=SERVICE&usage=purchase&status=inactive&page=2'
    );
    expect(screen.getByText('Editar cadastro')).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Cadastros' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(state.router.push).toHaveBeenCalledWith({
      pathname: '/produtos-servicos',
      query: { q: 'Frete', kind: 'SERVICE', usage: 'purchase', status: 'inactive', page: '2' }
    });
  });
  it('ignores a late item response after changing company', async () => {
    state.router.query = { id: 'item' };
    let finish!: (value: unknown) => void;
    vi.mocked(api)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
      .mockResolvedValueOnce({ id: 'item', name: 'Outro item' });
    const view = render(<CatalogItemPage editing />);
    state.company = { id: 24 };
    view.rerender(<CatalogItemPage editing />);
    await screen.findByText('24: Outro item');
    finish({ id: 'item', name: 'Empresa anterior' });
    await waitFor(() => expect(screen.queryByText(/Empresa anterior/)).toBeNull());
  });
});
