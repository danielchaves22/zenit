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
let cardsResponse: any[] = []
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
    cardsResponse = [
      {
        id: 1,
        name: 'Nubank Daniel',
        balance: '-300.00',
        creditLimit: '4200.00'
      }
    ]
    purchasesResponse = [buildPurchase()]
    pushMock.mockReset()
    addToastMock.mockReset()
    confirmMock.mockReset()
    vi.mocked(api.delete).mockReset()
    vi.mocked(api.get).mockReset()

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') {
        return Promise.resolve({
          data: cardsResponse
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

  it('shows only installment purchases when the API returns mixed card purchases', async () => {
    purchasesResponse = [
      buildPurchase({
        groupKey: 'purchase-cash',
        purchaseGroupId: null,
        representativeTransactionId: 7,
        description: 'Compra a Vista',
        installmentAmount: '120.00',
        totalAmount: '120.00',
        installmentCount: 1,
        installments: [
          {
            id: 301,
            installmentNumber: 1,
            totalInstallments: 1,
            amount: '120.00',
            dueDate: '2026-06-17T12:00:00.000Z',
            scheduledDate: '2026-06-01T12:00:00.000Z',
            status: 'COMPLETED',
            creditCardInvoice: {
              id: 401,
              referenceYear: 2026,
              referenceMonth: 6,
              dueDate: '2026-06-17T12:00:00.000Z',
              status: 'OPEN'
            }
          }
        ]
      }),
      buildPurchase({
        groupKey: 'purchase-installment',
        representativeTransactionId: 42,
        description: 'Notebook Parcelado'
      })
    ]

    render(<CreditCardPurchasesPage />)

    expect(await screen.findByRole('heading', { name: 'Compras Parceladas no Cartao' })).toBeInTheDocument()
    expect(await screen.findByText('Notebook Parcelado')).toBeInTheDocument()
    expect(screen.queryByText('Compra a Vista')).not.toBeInTheDocument()
  })

  it('keeps purchase notes hidden while the row is collapsed', async () => {
    purchasesResponse = [
      buildPurchase({
        notes: 'Importado por conciliacao de cartao'
      })
    ]

    render(<CreditCardPurchasesPage />)

    expect(await screen.findByText('Notebook Parcelado')).toBeInTheDocument()
    expect(screen.queryByText('Importado por conciliacao de cartao')).not.toBeInTheDocument()
  })

  it('shows the last invoice reference and remaining installments in the collapsed row', async () => {
    purchasesResponse = [
      buildPurchase({
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
              status: 'PAID'
            }
          },
          {
            id: 102,
            installmentNumber: 2,
            totalInstallments: 3,
            amount: '100.00',
            dueDate: '2026-07-17T12:00:00.000Z',
            scheduledDate: '2026-07-01T12:00:00.000Z',
            status: 'COMPLETED',
            creditCardInvoice: {
              id: 202,
              referenceYear: 2026,
              referenceMonth: 7,
              dueDate: '2026-07-17T12:00:00.000Z',
              status: 'OPEN'
            }
          },
          {
            id: 103,
            installmentNumber: 3,
            totalInstallments: 3,
            amount: '100.00',
            dueDate: '2026-08-17T12:00:00.000Z',
            scheduledDate: '2026-08-01T12:00:00.000Z',
            status: 'COMPLETED',
            creditCardInvoice: {
              id: 203,
              referenceYear: 2026,
              referenceMonth: 8,
              dueDate: '2026-08-17T12:00:00.000Z',
              status: 'OPEN'
            }
          }
        ]
      })
    ]

    render(<CreditCardPurchasesPage />)

    expect(await screen.findByText('Notebook Parcelado')).toBeInTheDocument()
    expect(screen.getByText('2 restantes')).toBeInTheDocument()
    expect(screen.getByText('08/2026')).toBeInTheDocument()
  })

  it('paginates purchases independently for each card', async () => {
    cardsResponse = [
      {
        id: 1,
        name: 'Nubank Daniel',
        balance: '-300.00',
        creditLimit: '4200.00'
      },
      {
        id: 2,
        name: 'Itau Empresa',
        balance: '-150.00',
        creditLimit: '8000.00'
      }
    ]

    purchasesResponse = [
      ...Array.from({ length: 21 }, (_, index) =>
        buildPurchase({
          groupKey: `card-1-${index + 1}`,
          purchaseGroupId: `card-1-${index + 1}`,
          representativeTransactionId: index + 1,
          description: `Card 1 Parcelado ${String(index + 1).padStart(2, '0')}`
        })
      ),
      ...Array.from({ length: 2 }, (_, index) =>
        buildPurchase({
          groupKey: `card-2-${index + 1}`,
          purchaseGroupId: `card-2-${index + 1}`,
          representativeTransactionId: 100 + index,
          description: `Card 2 Parcelado ${String(index + 1).padStart(2, '0')}`,
          card: {
            id: 2,
            name: 'Itau Empresa'
          }
        })
      )
    ]

    const user = userEvent.setup()

    render(<CreditCardPurchasesPage />)

    expect(await screen.findByText('Card 1 Parcelado 01')).toBeInTheDocument()
    expect(screen.getByText('Card 2 Parcelado 01')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Proxima pagina de Nubank Daniel' }))

    expect(await screen.findByText('Card 1 Parcelado 21')).toBeInTheDocument()
    expect(screen.queryByText('Card 1 Parcelado 01')).not.toBeInTheDocument()
    expect(screen.getByText('Card 2 Parcelado 01')).toBeInTheDocument()
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
