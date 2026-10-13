import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PaymentDialog } from '@/components/PurchasePage';
import { Purchase, PurchaseInstallment, PurchaseOptions } from '@/lib/purchases';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
const purchase = { id: 'purchase', installmentCount: 3, total: '100.00' } as Purchase;
const installment: PurchaseInstallment = {
  id: 12,
  number: 1,
  amount: '33.33',
  paidAmount: null,
  dueDate: '2026-10-31',
  effectiveDate: null,
  status: 'PENDING',
  updatedAt: '2026-10-13T12:00:00.000Z',
  account: { id: 5, name: 'Caixa' },
  canSettle: true
};
const options: PurchaseOptions = {
  enabled: true,
  accounts: [{ id: 5, name: 'Caixa', isDefault: true }],
  categories: []
};
beforeEach(() => vi.clearAllMocks());
describe('purchase payment dialog', () => {
  it('shows the full settlement consequence for a different amount and prevents duplicate submits', async () => {
    let finish!: (value: Purchase) => void;
    vi.mocked(api).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    const saved = vi.fn();
    render(
      <PaymentDialog
        companyId={23}
        purchase={purchase}
        installment={installment}
        options={options}
        onClose={vi.fn()}
        onSaved={saved}
      />
    );
    fireEvent.change(screen.getByLabelText('Valor pago'), { target: { value: '30,00' } });
    expect(screen.getByText(/quitada integralmente/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    expect(screen.getByRole('button', { name: 'Processando…' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Processando…' }));
    expect(api).toHaveBeenCalledTimes(1);
    const [path, config] = vi.mocked(api).mock.calls[0];
    expect(path).toBe('/bizz/purchases/purchase/installments/12/settle');
    expect(JSON.parse(config!.body as string)).toMatchObject({
      amount: '30.00',
      fromAccountId: 5,
      expectedUpdatedAt: installment.updatedAt
    });
    await act(async () => {
      finish(purchase);
    });
    expect(saved).toHaveBeenCalledWith(purchase);
  });
  it('preserves the dialog and idempotency key when the payment response is lost', async () => {
    vi.mocked(api)
      .mockRejectedValueOnce(new Error('Conexão interrompida.'))
      .mockResolvedValueOnce(purchase);
    const close = vi.fn();
    render(
      <PaymentDialog
        companyId={23}
        purchase={purchase}
        installment={installment}
        options={options}
        onClose={close}
        onSaved={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conexão interrompida.');
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pagamento' }));
    await waitFor(() => expect(close).toHaveBeenCalled());
    expect(vi.mocked(api).mock.calls[0][1]?.body).toBe(vi.mocked(api).mock.calls[1][1]?.body);
  });
});
