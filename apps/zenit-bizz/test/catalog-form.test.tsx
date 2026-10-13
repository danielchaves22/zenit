import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CatalogItemForm } from '@/components/CatalogItemForm';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { CatalogItem, parseSalePrice, formatSalePrice } from '@/lib/catalog';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('next/router', () => ({
  useRouter: () => ({ beforePopState: vi.fn(), events: { on: vi.fn(), off: vi.fn() } })
}));
beforeEach(() => vi.clearAllMocks());
describe('catalog form', () => {
  it('creates a service from the list filters and normalizes a Brazilian price', async () => {
    vi.mocked(api).mockResolvedValue({ id: 'saved' });
    const saved = vi.fn();
    render(
      <CatalogItemForm
        item={null}
        kind="SERVICE"
        usage="sale"
        companyId={23}
        onClose={vi.fn()}
        onSaved={saved}
      />
    );
    expect(screen.getByLabelText(/Unidade/)).toHaveValue('Serviço');
    expect(screen.getByLabelText('Utilização')).toHaveValue('sale');
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Decoração de evento' } });
    fireEvent.change(screen.getByLabelText(/Preço de venda/), { target: { value: '1.234,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const payload = JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string);
    expect(payload).toMatchObject({
      kind: 'SERVICE',
      unit: 'Serviço',
      canPurchase: false,
      canSell: true,
      salePrice: '1234.50'
    });
    expect(payload).not.toHaveProperty('companyId');
    expect(payload.requestKey).toBeTruthy();
  });
  it('retains a custom unit when type changes and focuses an invalid price without submitting', () => {
    render(<CatalogItemForm item={null} companyId={23} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Frete' } });
    fireEvent.change(screen.getByLabelText(/Unidade/), { target: { value: 'Viagem' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'SERVICE' } });
    expect(screen.getByLabelText(/Unidade/)).toHaveValue('Viagem');
    fireEvent.change(screen.getByLabelText(/Preço de venda/), { target: { value: '12,345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('duas casas decimais');
    expect(
      screen.getByRole('textbox', { name: 'Preço de venda (R$) (opcional)' })
    ).toHaveAttribute('aria-describedby', 'catalog-price-error');
    expect(screen.getByLabelText(/Preço de venda/)).toHaveFocus();
    expect(api).not.toHaveBeenCalled();
  });
  it('preserves a loaded item despite list filters and saves an empty price as null', async () => {
    vi.mocked(api).mockResolvedValue({ id: 'item' });
    const item = {
      id: 'item',
      name: 'Rosa',
      kind: 'PRODUCT',
      unit: 'Unidade',
      canPurchase: true,
      canSell: true,
      salePrice: '0.00',
      active: true,
      version: 3
    } as CatalogItem;
    render(
      <CatalogItemForm
        item={item}
        kind="SERVICE"
        usage="sale"
        companyId={23}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Tipo')).toHaveValue('PRODUCT');
    expect(screen.getByLabelText('Utilização')).toHaveValue('both');
    expect(screen.getByLabelText(/Preço de venda/)).toHaveValue('0,00');
    fireEvent.change(screen.getByLabelText(/Preço de venda/), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText(/Cadastro ativo/));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(JSON.parse(vi.mocked(api).mock.calls[0][1]!.body as string)).toMatchObject({
      version: 3,
      salePrice: null,
      active: false
    });
  });
  it('keeps values and the same request key after a failure and protects unsaved navigation', async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error('Conexão interrompida.'))
      .mockResolvedValueOnce({ id: 'saved' });
    const close = vi.fn();
    render(
      <NavigationProvider>
        <CatalogItemForm item={null} companyId={23} onClose={close} onSaved={vi.fn()} />
      </NavigationProvider>
    );
    fireEvent.change(screen.getByLabelText(/Nome/), { target: { value: 'Arranjo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('alert');
    expect(screen.getByLabelText(/Nome/)).toHaveValue('Arranjo');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    const calls = vi.mocked(api).mock.calls.map((call) => JSON.parse(call[1]!.body as string));
    expect(calls[0].requestKey).toBe(calls[1].requestKey);
  });
});
describe('catalog price precision', () => {
  it.each([
    ['', null],
    ['0', '0.00'],
    ['12,3', '12.30'],
    ['1.234,56', '1234.56'],
    ['0.01', '0.01'],
    ['999999999999,99', '999999999999.99']
  ])('parses %s without floating point rounding', (value, expected) =>
    expect(parseSalePrice(value!)).toBe(expected)
  );
  it.each(['-1', '1e3', '12.345', '1,234.56', '1000000000000', 'NaN'])('rejects %s', (value) =>
    expect(() => parseSalePrice(value)).toThrow()
  );
  it('distinguishes zero from an unspecified price', () => {
    expect(formatSalePrice('0.00')).toBe('R$ 0,00');
    expect(formatSalePrice(null)).toBe('—');
  });
});
