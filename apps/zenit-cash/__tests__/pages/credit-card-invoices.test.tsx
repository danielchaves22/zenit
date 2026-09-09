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
  Modal: ({
    isOpen,
    title,
    children,
    footer
  }: {
    isOpen: boolean
    title: string
    children: ReactNode
    footer?: ReactNode
  }) => isOpen ? (
    <div role="dialog" aria-label={title}>
      <h2>{title}</h2>
      {children}
      {footer}
    </div>
  ) : null
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

  it('verifica e corrige parcialmente as fixas ausentes preservando a fatura selecionada', async () => {
    const user = userEvent.setup()
    const endpoint = '/financial/credit-cards/1/invoices/2026/9/fixed-materialization'
    const closedInvoice = {
      ...invoice,
      status: 'CLOSED',
      fixedItemCount: 2,
      fixedSubtotal: '304.37',
      totalAmount: '754.37',
      hasProjectedTransactions: true
    }
    const closedInvoiceDetail = {
      ...invoiceDetail,
      ...closedInvoice,
      transactions: [
        ...invoiceDetail.transactions,
        {
          id: null,
          description: 'Tênis Cibele',
          amount: '220.00',
          date: '2026-09-10',
          isProjected: true,
          isFixedProjection: true,
          fixedTemplateId: 197,
          category: null
        },
        {
          id: null,
          description: 'Seguro Residencial Caixa',
          amount: '84.37',
          date: '2026-09-10',
          isProjected: true,
          isFixedProjection: true,
          fixedTemplateId: 198,
          category: null
        }
      ]
    }
    const inspection = {
      accountId: 1,
      invoiceId: 101,
      referenceYear: 2026,
      referenceMonth: 9,
      status: 'CLOSED',
      canMaterialize: true,
      reason: null,
      expectedCount: 3,
      materializedCount: 1,
      ignoredCount: 1,
      missingCount: 2,
      inconsistencyCount: 1,
      excludedUnboundedInactiveTemplateCount: 1,
      warnings: [
        'Um template inativo sem data final foi excluído por falta de histórico suficiente.'
      ],
      missingOccurrences: [
        {
          templateId: 197,
          description: 'Tênis Cibele',
          amount: '220.00',
          occurrenceKey: '197:2026-09',
          occurrenceDate: '2026-09-10'
        },
        {
          templateId: 198,
          description: 'Seguro Residencial Caixa',
          amount: '84.37',
          occurrenceKey: '198:2026-09',
          occurrenceDate: '2026-09-10'
        }
      ],
      materializedOccurrences: [],
      inconsistentOccurrences: [
        {
          templateId: 196,
          description: 'Fixa já existente em outra fatura',
          amount: '35.00',
          occurrenceKey: '196:2026-09',
          occurrenceDate: '2026-09-10',
          issue: 'OCCURRENCE_KEY_WRONG_INVOICE',
          transactionIds: [901],
          message: 'A ocorrência está vinculada a outra competência.'
        }
      ]
    }
    const partialResult = {
      ...inspection,
      materializedCount: 2,
      missingCount: 1,
      missingOccurrences: [inspection.missingOccurrences[1]],
      attemptedCount: 2,
      createdCount: 1,
      failedCount: 1,
      errors: [
        {
          templateId: 198,
          description: 'Seguro Residencial Caixa',
          error: 'Categoria financeira incompatível'
        }
      ]
    }

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') {
        return Promise.resolve({ data: [card] })
      }

      if (url === '/financial/credit-cards/1/invoices?includePaid=false') {
        return Promise.resolve({ data: [closedInvoice] })
      }

      if (url === '/financial/accounts') {
        return Promise.resolve({ data: [] })
      }

      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: closedInvoiceDetail })
      }

      if (url === endpoint) {
        return Promise.resolve({ data: inspection })
      }

      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockResolvedValue({ data: partialResult })

    render(<CreditCardInvoicesPage />)

    const repairButton = await screen.findByRole('button', {
      name: 'Corrigir materialização'
    })
    await user.click(repairButton)

    expect(api.get).toHaveBeenCalledWith(endpoint)
    expect(
      await screen.findByRole('dialog', {
        name: 'Materialização das fixas — Fatura 09/2026'
      })
    ).toBeInTheDocument()
    expect(screen.getAllByText('Tênis Cibele').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Seguro Residencial Caixa').length).toBeGreaterThan(0)
    expect(screen.getByText(/estado atual dos templates fixos/i)).toBeInTheDocument()
    expect(screen.getByText('Materializadas (inclui ignoradas)')).toBeInTheDocument()
    expect(screen.getByText('Inconsistências')).toBeInTheDocument()
    expect(screen.getByText('Avisos da verificação')).toBeInTheDocument()
    expect(screen.getByText(/template foi excluído.*não será materializado/i)).toBeInTheDocument()
    expect(screen.getByText('Inconsistências encontradas')).toBeInTheDocument()
    expect(screen.getByText('Fixa já existente em outra fatura')).toBeInTheDocument()
    expect(screen.getByText('Ocorrência vinculada a outra fatura')).toBeInTheDocument()
    expect(screen.getByText(/não serão corrigidos nem duplicados/i)).toBeInTheDocument()
    expect(screen.getByText('Transações relacionadas: 901')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Materializar 2 itens faltantes' })
    )

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(endpoint)
    })
    expect(await screen.findByText('Falhas da última tentativa')).toBeInTheDocument()
    expect(screen.getByText('Categoria financeira incompatível')).toBeInTheDocument()
    expect(addToastMock).toHaveBeenCalledWith(
      'Correção parcial: 1 criada(s) e 1 falha(s)',
      'error'
    )

    await waitFor(() => {
      expect(
        vi.mocked(api.get).mock.calls.filter(
          ([url]) => url === '/financial/credit-cards/1/invoices?includePaid=false'
        )
      ).toHaveLength(2)
    })
    expect(replaceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ invoiceKey: 'invoice:101' })
      }),
      undefined,
      { shallow: true }
    )
  })

  it('explica por que um cartão inativo não pode receber o reparo', async () => {
    const user = userEvent.setup()
    const endpoint = '/financial/credit-cards/1/invoices/2026/9/fixed-materialization'
    const closedInvoice = { ...invoice, status: 'CLOSED' }
    const report = {
      accountId: 1,
      invoiceId: 101,
      referenceYear: 2026,
      referenceMonth: 9,
      status: 'CLOSED',
      canMaterialize: false,
      reason: 'ACCOUNT_INACTIVE',
      expectedCount: 1,
      materializedCount: 0,
      ignoredCount: 0,
      missingCount: 1,
      inconsistencyCount: 0,
      excludedUnboundedInactiveTemplateCount: 0,
      warnings: [],
      missingOccurrences: [
        {
          templateId: 197,
          description: 'Fixa histórica',
          amount: '50.00',
          occurrenceKey: '197:2026-09',
          occurrenceDate: '2026-09-10'
        }
      ],
      materializedOccurrences: [],
      inconsistentOccurrences: []
    }

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices?includePaid=false') {
        return Promise.resolve({ data: [closedInvoice] })
      }
      if (url === '/financial/accounts') return Promise.resolve({ data: [] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: { ...invoiceDetail, ...closedInvoice } })
      }
      if (url === endpoint) return Promise.resolve({ data: report })
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    render(<CreditCardInvoicesPage />)
    await user.click(await screen.findByRole('button', { name: 'Verificar fixas' }))

    expect(
      await screen.findByText('Este cartão está inativo e não pode receber novas materializações.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Materializar 1 item faltante/ })).not.toBeInTheDocument()
  })
})
