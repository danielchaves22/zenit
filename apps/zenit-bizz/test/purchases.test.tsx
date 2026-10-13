import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  installmentPreview,
  lineTotal,
  decimalInput,
  moneyFromCents,
  PurchaseOptions
} from '@/lib/purchases';
import { PurchaseForm } from '@/components/PurchaseForm';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/components/PurchaseLookup', () => ({
  PurchaseLookup: ({
    label,
    onChange
  }: {
    label: string;
    onChange: (item: { id: string; name: string }) => void;
  }) => (
    <button type="button" onClick={() => onChange({ id: label, name: label })}>
      Selecionar {label}
    </button>
  )
}));
const options: PurchaseOptions = {
  enabled: true,
  accounts: [{ id: 1, name: 'Caixa', isDefault: true }],
  categories: []
};
beforeEach(() => vi.clearAllMocks());
describe('purchase values and monthly installments', () => {
  it('calculates fractional quantities in cents without floating-point loss', () => {
    expect(moneyFromCents(lineTotal('0,125', '0,04'))).toBe('0.01');
    expect(moneyFromCents(lineTotal('3', '33,33'))).toBe('99.99');
    expect(moneyFromCents(lineTotal('99999999,999', '0,01'))).toBe('1000000.00');
    expect(() => decimalInput('1e3', 2, 10)).toThrow();
    expect(() => decimalInput('-1', 2, 10)).toThrow();
    expect(() => decimalInput('0', 2, 10)).toThrow();
    expect(decimalInput('1.234,50', 2, 10).text).toBe('1234.50');
    expect(() => decimalInput('1.2,50', 2, 10)).toThrow();
  });
  it('preserves total cents and month-end due dates, including leap years', () => {
    expect(installmentPreview(BigInt(10000), 3, '2028-01-31')).toEqual([
      { number: 1, amount: '33.33', dueDate: '2028-01-31' },
      { number: 2, amount: '33.33', dueDate: '2028-02-29' },
      { number: 3, amount: '33.34', dueDate: '2028-03-31' }
    ]);
    expect(installmentPreview(BigInt(2), 3, '2027-01-31')).toEqual([]);
    expect(installmentPreview(BigInt(100), 1.5, '2027-01-31')).toEqual([]);
  });
});
describe('purchase creation', () => {
  function fill() {
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Fornecedor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selecionar Produto ou serviço 1' }));
    fireEvent.change(screen.getByLabelText('Valor unitário do item 1'), {
      target: { value: '100,00' }
    });
    fireEvent.change(screen.getByLabelText('Parcelas mensais'), { target: { value: '3' } });
  }
  it('submits decimal strings and finance choices, without a client supplied total or company', async () => {
    vi.mocked(api).mockResolvedValue({ id: 'purchase' });
    const saved = vi.fn();
    render(<PurchaseForm companyId={23} options={options} onBack={vi.fn()} onSaved={saved} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const [path, config] = vi.mocked(api).mock.calls[0];
    const payload = JSON.parse(config!.body as string);
    expect(path).toBe('/bizz/purchases');
    expect(config?.companyId).toBe(23);
    expect(payload).toMatchObject({
      fromAccountId: 1,
      categoryId: null,
      installmentCount: 3,
      items: [{ quantity: '1.000', unitPrice: '100.00' }]
    });
    expect(payload).not.toHaveProperty('total');
    expect(payload).not.toHaveProperty('companyId');
  });
  it('preserves form values and request identity when the response is lost', async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error('Conexão interrompida.'))
      .mockResolvedValueOnce({ id: 'purchase' });
    render(<PurchaseForm companyId={23} options={options} onBack={vi.fn()} onSaved={vi.fn()} />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida.');
    expect(screen.getByLabelText('Valor unitário do item 1')).toHaveValue('100,00');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api).mock.calls[0][1]?.body).toBe(vi.mocked(api).mock.calls[1][1]?.body);
  });
  it('does not send incomplete selections', () => {
    render(<PurchaseForm companyId={23} options={options} onBack={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Valor unitário do item 1'), {
      target: { value: '10,00' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar compra' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Selecione um fornecedor');
    expect(api).not.toHaveBeenCalled();
  });
});
