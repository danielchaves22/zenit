import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CreditCardInvoicesPage from '@/pages/financial/credit-cards/[accountId]/invoices'
import api from '@/lib/api'

const replaceMock = vi.fn()
const addToastMock = vi.fn()

const card = {
  id: 1,
  name: 'Cartao de teste',
  balance: '-450.00',
  creditLimit: '5000.00',
  statementClosingDay: 10,
  statementDueDay: 17
}

const invoice = {
  id: 101,
  referenceYear: 2026,
  referenceMonth: 9,
  closingDate: '2026-09-10',
  dueDate: '2026-09-17',
  totalAmount: '450.00',
  status: 'OPEN',
  itemCount: 1,
  fixedItemCount: 0,
  itemsSubtotal: '450.00',
  fixedSubtotal: '0.00',
  isProjected: false,
  hasProjectedTransactions: false,
  externalSettledAmount: '0.00',
  hasExternalSettlements: false,
  paymentTransaction: null
}

const invoiceDetail = {
  ...invoice,
  account: card,
  transactions: [
    {
      id: 501,
      description: 'Compra preservada no detalhe',
      amount: '450.00',
      installmentNumber: 1,
      totalInstallments: 1,
      date: '2026-09-05',
      category: {
        id: 7,
        name: 'Teste',
        color: '#2563eb'
      }
    }
  ]
}

vi.mock('next/router', () => ({
  useRouter: () => ({
    isReady: true,
    pathname: '/financial/credit-cards/[accountId]/invoices',
    query: { accountId: '1' },
    replace: replaceMock
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
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode
    variant?: string
  }) => <button {...props}>{children}</button>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>
}))

vi.mock('@/components/ui/Modal', () => ({
  Modal: () => null
}))

vi.mock('@/components/ui/ConfirmationModal', () => ({
  ConfirmationModal: () => null
}))

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
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
    confirm: vi.fn(),
    handleConfirm: vi.fn(),
    handleClose: vi.fn()
  })
}))

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

describe('CreditCardInvoicesPage', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    replaceMock.mockResolvedValue(true)
    addToastMock.mockReset()
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    Element.prototype.scrollIntoView = vi.fn()

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') {
        return Promise.resolve({ data: [card] })
      }

      if (url === '/financial/credit-cards/1/invoices?includePaid=false') {
        return Promise.resolve({ data: [invoice] })
      }

      if (url === '/financial/accounts') {
        return Promise.resolve({ data: [] })
      }

      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: invoiceDetail })
      }

      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
  })

  it('amplia os detalhes, preserva a fatura selecionada e restaura a visualizacao normal', async () => {
    const user = userEvent.setup()

    render(<CreditCardInvoicesPage />)

    expect(await screen.findByText('Compra preservada no detalhe')).toBeInTheDocument()
    expect(screen.getByText('Limite do cartao')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Faturas' })).toBeInTheDocument()

    const expandButton = screen.getByRole('button', {
      name: 'Ampliar detalhes da fatura'
    })
    expect(expandButton).toHaveAttribute('title', 'Ampliar detalhes da fatura')
    expect(expandButton).toHaveAttribute('aria-pressed', 'false')

    await user.click(expandButton)

    expect(screen.queryByText('Limite do cartao')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Faturas' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Faturas de Cartao de teste' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova Compra' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fatura 09/2026' })).toBeInTheDocument()
    expect(screen.getByText('Compra preservada no detalhe')).toBeInTheDocument()

    const restoreButton = screen.getByRole('button', {
      name: 'Voltar à visualização normal'
    })
    expect(restoreButton).toHaveAttribute('title', 'Voltar à visualização normal')
    expect(restoreButton).toHaveAttribute('aria-pressed', 'true')

    await user.click(restoreButton)

    await waitFor(() => {
      expect(screen.getByText('Limite do cartao')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Faturas' })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Fatura 09/2026' })).toBeInTheDocument()
    expect(screen.getByText('Compra preservada no detalhe')).toBeInTheDocument()
    expect(
      vi.mocked(api.get).mock.calls.filter(
        ([url]) => url === '/financial/credit-card-invoices/101'
      )
    ).toHaveLength(1)
  })
})
