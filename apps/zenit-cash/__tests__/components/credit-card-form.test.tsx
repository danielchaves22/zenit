import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreditCardForm from '@/components/financial/CreditCardForm'
import api from '@/lib/api'

const pushMock = vi.fn()
const addToastMock = vi.fn()
const confirmMock = vi.fn()

let isCompanyOwner = false
let previewLoads = 0

vi.mock('next/router', () => ({
  useRouter: () => ({
    push: pushMock
  })
}))

vi.mock('@/components/financial/BankLogo', () => ({
  default: () => <div data-testid="bank-logo" />
}))

vi.mock('@/components/financial/BankSelect', () => ({
  default: ({
    label,
    value,
    onChange,
    disabled
  }: {
    label: string
    value: string
    onChange: (value: string) => void
    disabled?: boolean
  }) => (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">Selecione um banco</option>
        <option value="1">Nubank</option>
      </select>
    </label>
  )
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    className,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
    <button className={className} {...props}>
      {children}
    </button>
  )
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({
    children,
    className
  }: {
    children: ReactNode
    className?: string
  }) => <div className={className}>{children}</div>
}))

vi.mock('@/components/ui/ConfirmationModal', () => ({
  ConfirmationModal: () => <div data-testid="confirmation-modal" />
}))

vi.mock('@/components/ui/CurrencyInput', () => ({
  CurrencyInput: ({
    label,
    value,
    onChange,
    disabled
  }: {
    label: string
    value: string
    onChange: (value: string) => void
    disabled?: boolean
  }) => (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        disabled={disabled}
      />
    </label>
  )
}))

vi.mock('@/components/ui/Input', () => ({
  Input: ({
    label,
    value = '',
    onChange,
    disabled,
    className,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
    <label className={className}>
      {label ? <span>{label}</span> : null}
      <input value={value} onChange={onChange} disabled={disabled} {...props} />
    </label>
  )
}))

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({
    addToast: addToastMock
  })
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isCompanyOwner
  })
}))

vi.mock('@/hooks/useConfirmation', () => ({
  useConfirmation: () => ({
    isOpen: false,
    loading: false,
    options: {
      title: '',
      message: '',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      type: 'info'
    },
    confirm: confirmMock,
    handleConfirm: vi.fn(),
    handleClose: vi.fn()
  })
}))

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}))

function buildAccountResponse() {
  return {
    id: 1,
    name: 'Nubank Daniel',
    type: 'CREDIT_CARD',
    balance: '-50.00',
    bankId: 1,
    bankName: 'Nubank',
    creditLimit: '2500.00',
    cardColor: '#7C3AED',
    statementClosingDay: 10,
    statementDueDay: 17,
    isActive: true
  }
}

describe('CreditCardForm', () => {
  beforeEach(() => {
    isCompanyOwner = false
    previewLoads = 0
    pushMock.mockReset()
    addToastMock.mockReset()
    confirmMock.mockReset()
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.put).mockReset()

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/banks') {
        return Promise.resolve({
          data: [
            {
              id: 1,
              code: '260',
              name: 'Nubank',
              iconSlug: 'nubank'
            }
          ]
        })
      }

      if (url === '/financial/accounts/1') {
        return Promise.resolve({
          data: buildAccountResponse()
        })
      }

      if (url === '/financial/credit-cards/1/reset/preview') {
        previewLoads += 1
        return Promise.resolve({
          data: {
            card: {
              id: 1,
              name: 'Nubank Daniel',
              currentBalance: previewLoads === 1 ? '-50.00' : '0.00',
              creditLimit: '2500.00'
            },
            preserved: {
              cardMetadata: true
            },
            deleted: {
              transactions: previewLoads === 1 ? 4 : 0,
              creditCardPurchases: previewLoads === 1 ? 3 : 0,
              creditCardInvoices: previewLoads === 1 ? 2 : 0,
              fixedTemplates: previewLoads === 1 ? 1 : 0,
              fixedOccurrences: previewLoads === 1 ? 1 : 0,
              invoicePayments: previewLoads === 1 ? 1 : 0
            },
            balances: {
              affectedAccounts: previewLoads === 1 ? 1 : 0,
              cardBalanceAfterReset: '0.00'
            },
            safeguards: {
              affectsOnlySelectedCard: true,
              budgetsUnaffected: true
            }
          }
        })
      }

      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    vi.mocked(api.post).mockResolvedValue({ data: {} } as any)
    vi.mocked(api.put).mockResolvedValue({ data: buildAccountResponse() } as any)
  })

  it('shows the reset danger zone only for company owners', async () => {
    isCompanyOwner = true

    render(<CreditCardForm mode="edit" cardId="1" />)

    expect(await screen.findByText('Editar Cartao')).toBeInTheDocument()
    expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument()
    expect(screen.getByText('Resetar historico deste cartao')).toBeInTheDocument()
  })

  it('hides the reset danger zone for non-owners', async () => {
    isCompanyOwner = false

    render(<CreditCardForm mode="edit" cardId="1" />)

    expect(await screen.findByText('Editar Cartao')).toBeInTheDocument()
    expect(screen.queryByText('Resetar historico deste cartao')).not.toBeInTheDocument()
  })

  it('executes the owner-only reset flow with preview and confirmation text', async () => {
    isCompanyOwner = true
    confirmMock.mockImplementation(
      async (
        _options: unknown,
        onConfirm: () => Promise<void> | void
      ) => {
        await onConfirm()
      }
    )

    const user = userEvent.setup()

    render(<CreditCardForm mode="edit" cardId="1" />)

    expect(await screen.findByText('Resetar historico deste cartao')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Gerar Previa do Reset/i }))

    expect(await screen.findByText('4 transacoes')).toBeInTheDocument()

    await user.click(
      screen.getByLabelText(/Entendo que este reset afeta apenas o cartao atual/i)
    )
    await user.type(screen.getByLabelText('Digite "RESETAR" para confirmar'), 'RESETAR')
    await user.click(screen.getByRole('button', { name: /Executar Reset do Cartao/i }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/financial/credit-cards/1/reset', {
        confirmationText: 'RESETAR'
      })
    })

    expect(addToastMock).toHaveBeenCalledWith(
      'Historico do cartao resetado com sucesso',
      'success'
    )
  })
})
