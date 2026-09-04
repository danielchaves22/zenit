import type { ComponentProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TransactionSettlementModal from '@/components/financial/TransactionSettlementModal'

function renderModal(overrides: Partial<ComponentProps<typeof TransactionSettlementModal>> = {}) {
  return render(
    <TransactionSettlementModal
      isOpen
      kind="EXPENSE"
      accounts={[{ id: 1, name: 'Conta Corrente', type: 'CHECKING' }]}
      accountId="1"
      amount="132.45"
      settlementDate="2026-09-04"
      notes=""
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      onAccountIdChange={vi.fn()}
      onAmountChange={vi.fn()}
      onSettlementDateChange={vi.fn()}
      onNotesChange={vi.fn()}
      {...overrides}
    />
  )
}

describe('TransactionSettlementModal', () => {
  it('focuses and selects the transaction amount when opened', async () => {
    renderModal()

    const amountInput = screen.getByLabelText('Valor da transação') as HTMLInputElement

    expect(amountInput).toHaveValue('132,45')

    await waitFor(() => expect(amountInput).toHaveFocus())

    expect(amountInput.selectionStart).toBe(0)
    expect(amountInput.selectionEnd).toBe(amountInput.value.length)
  })

  it('emits amount changes as decimal values', () => {
    const onAmountChange = vi.fn()
    renderModal({ onAmountChange })

    fireEvent.input(screen.getByLabelText('Valor da transação'), {
      target: { value: '15555' }
    })

    expect(onAmountChange).toHaveBeenLastCalledWith('155.55')
  })
})
