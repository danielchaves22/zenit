import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreditCardPurchasesPage from '@/pages/financial/credit-cards/purchases'
import api from '@/lib/api'

const pushMock = vi.fn()
const addToastMock = vi.fn()
const confirmMock = vi.fn()

let isCompanyOwner = false
let purchasesResponse: any[] = []

vi.mock('next/router', () => ({
  useRouter: () => ({
    isReady: true,
    query: {},
    push: pushMock
  })
}))

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  )
}))

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/AccessGuard', () => ({
  PageGuard: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/Breadcrumb', () => ({
  Breadcrumb: () => null
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
  Card: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/ConfirmationModal', () => ({
  ConfirmationModal: () => <div data-testid="confirmation-modal" />
}))

vi.mock('@/components/ui/MultiSelect', () => ({
  MultiSelect: ({ label }: { label: string }) => <div>{label}</div>
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
    delete: vi.fn()
  }
}))

function buildPurchase(overrides?: Partial<any>) {
  return {
    groupKey: 'purchase-group-1',
    purchaseGroupId: 'purchase-group-1',
    representativeTransactionId: 42,
    description: 'Notebook Parcelado',
    notes: '',
    purchaseDate: '2026-06-01T12:00:00.000Z',
    installmentAmount: '100.00',
    totalAmount: '300.00',
    installmentCount: 3,
    card: {
      id: 1,
      name: 'Nubank Daniel'
    },
    category: {
      id: 10,
      name: 'Tecnologia',
      color: '#2563eb'
    },
    installments: [
      {
        id: 101,
        installmentNumber: 1,
        totalInstallments: 3,
        amount: '100.00',
        dueDate: '2026-06-17T12:00:00.000Z',
        scheduledDate: '2026-06-01T12:00:00.000Z',
        status: 'COMPLETED',
        creditCardInvoice: {
          id: 201,
          referenceYear: 2026,
          referenceMonth: 6,
          dueDate: '2026-06-17T12:00:00.000Z',
          status: 'OPEN'
        }
      }
    ],
    ...overrides
  }
}

describe('CreditCardPurchasesPage', () => {
  beforeEach(() => {
    isCompanyOwner = false
    purchasesResponse = [buildPurchase()]
    pushMock.mockReset()
    addToastMock.mockReset()
    confirmMock.mockReset()
    vi.mocked(api.delete).mockReset()
    vi.mocked(api.get).mockReset()

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') {
        return Promise.resolve({
          data: [
            {
              id: 1,
              name: 'Nubank Daniel',
              balance: '-300.00',
              creditLimit: '4200.00'
            }
          ]
        })
      }

      if (url === '/financial/categories') {
        return Promise.resolve({
          data: [
            {
              id: 10,
              name: 'Tecnologia',
              type: 'EXPENSE',
              color: '#2563eb'
            }
          ]
        })
      }

      if (url.startsWith('/financial/credit-card-purchases?')) {
        return Promise.resolve({
          data: {
            data: purchasesResponse,
            pages: 1
          }
        })
      }

      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    vi.mocked(api.delete).mockResolvedValue({ data: {} } as any)
  })

  it('shows the quick delete action only for company owners', async () => {
    isCompanyOwner = true

    render(<CreditCardPurchasesPage />)

    expect(await screen.findByText('Notebook Parcelado')).toBeInTheDocument()
    expect(screen.getByTestId('confirmation-modal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir compra' })).toBeInTheDocument()
  })

  it('hides the quick delete action for non-owners', async () => {
    isCompanyOwner = false

    render(<CreditCardPurchasesPage />)

    expect(await screen.findByText('Notebook Parcelado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir compra' })).not.toBeInTheDocument()
  })

  it('deletes grouped purchases with purchase scope from the list action', async () => {
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

    render(<CreditCardPurchasesPage />)

    expect(await screen.findByText('Notebook Parcelado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Excluir compra' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/financial/transactions/42', {
        params: { scope: 'purchase' }
      })
    })

    expect(addToastMock).toHaveBeenCalledWith('Compra excluida com sucesso', 'success')
  })
})
