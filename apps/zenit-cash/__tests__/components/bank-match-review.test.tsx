import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BankMatchReview from '@/components/financial/BankMatchReview';

const item = { id: 1, date: '2026-08-22', description: 'Extrato Padaria', amount: '-20.00' };
const transaction = { id: 9, date: '2026-08-22', description: 'Padaria registrada', amount: '-20.00', status: 'COMPLETED', type: 'EXPENSE', version: '2026-08-22T00:00:00.000Z' };
describe('Bank match human confirmation', () => {
  it('shows both sides and requires an explicit confirmation click', () => {
    const confirm = vi.fn();
    render(<BankMatchReview items={[item]} transactions={[transaction]} busy={false} onClose={vi.fn()} onConfirm={confirm} />);
    expect(screen.getByText('Extrato Padaria')).toBeInTheDocument();
    expect(screen.getByText('Padaria registrada')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar vínculo' }));
    expect(confirm).toHaveBeenCalledWith(false, '2026-08-22', '');
  });
  it('blocks amount mismatches and opposite-direction selections', () => {
    render(<BankMatchReview items={[item]} transactions={[{ ...transaction, amount: '-21.00' }]} busy={false} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Confirmar vínculo' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('diferença de valores');
  });
  it('requires explicit settlement consent for a pending transaction', () => {
    const confirm = vi.fn();
    render(<BankMatchReview items={[item]} transactions={[{ ...transaction, status: 'PENDING' }]} busy={false} onClose={vi.fn()} onConfirm={confirm} />);
    const button = screen.getByRole('button', { name: 'Liquidar e confirmar vínculo' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Data de liquidação'), { target: { value: '2026-08-23' } });
    fireEvent.click(button);
    expect(confirm).toHaveBeenCalledWith(true, '2026-08-23', '');
  });
});
