import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
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
  paymentTransaction: null,
  payments: [],
  paymentAmount: '0.00',
  outstandingAmount: '450.00',
  hasPayments: false
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
  ConfirmationModal: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText
  }: {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    title: string
    message: string
    confirmText: string
    cancelText: string
  }) => isOpen ? (
    <div role="dialog" aria-label={title}>
      <p>{message}</p>
      <button type="button" onClick={onClose}>{cancelText}</button>
      <button type="button" onClick={onConfirm}>{confirmText}</button>
    </div>
  ) : null
}))

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}))

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}))

describe('CreditCardInvoicesPage', () => {
  beforeEach(() => {
    replaceMock.mockReset()
    replaceMock.mockResolvedValue(true)
    addToastMock.mockReset()
    vi.mocked(api.get).mockReset()
    vi.mocked(api.post).mockReset()
    vi.mocked(api.delete).mockReset()
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

      if (url === '/financial/categories') {
        return Promise.resolve({ data: [] })
      }

      if (url === '/financial/credit-cards/1/refundable-purchases') {
        return Promise.resolve({ data: [] })
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

  it('abre o formulario de credito apenas para uma fatura real nao paga', async () => {
    const user = userEvent.setup()

    render(<CreditCardInvoicesPage />)

    const addCreditButton = await screen.findByRole('button', { name: 'Adicionar crédito' })
    await user.click(addCreditButton)

    expect(screen.getByRole('dialog', { name: 'Adicionar crédito à fatura' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Estorno' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cashback' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ajuste' })).toBeInTheDocument()
  })

  it('registra pagamento sem encerrar a fatura aberta', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices?includePaid=false') {
        return Promise.resolve({ data: [invoice] })
      }
      if (url === '/financial/accounts') {
        return Promise.resolve({
          data: [{ id: 9, name: 'Conta pagadora', type: 'CHECKING', isActive: true }]
        })
      }
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: invoiceDetail })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockResolvedValue({
      data: {
        ...invoiceDetail,
        status: 'OPEN',
        paymentAmount: '450.00',
        outstandingAmount: '0.00'
      }
    })

    render(<CreditCardInvoicesPage />)

    await user.click(await screen.findByRole('button', { name: 'Registrar pagamento' }))
    const dialog = screen.getByRole('dialog', { name: 'Registrar pagamento' })
    await user.selectOptions(within(dialog).getByLabelText('Conta pagadora'), '9')
    await user.click(within(dialog).getByRole('button', { name: 'Registrar pagamento' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/financial/credit-card-invoices/101/pay',
        expect.objectContaining({
          fromAccountId: 9,
          amount: 450
        })
      )
    })
    expect(addToastMock).toHaveBeenCalledWith(
      'Pagamento registrado. A fatura continua aberta.',
      'success'
    )
  })

  it('exclui um pagamento pela confirmacao renderizada e recalcula a fatura', async () => {
    const user = userEvent.setup()
    const detailWithPayment = {
      ...invoiceDetail,
      paymentAmount: '120.00',
      outstandingAmount: '330.00',
      hasPayments: true,
      payments: [{
        id: 701,
        transactionId: 901,
        amount: '120.00',
        paymentDate: '2026-09-08T12:00:00.000Z',
        transaction: {
          id: 901,
          description: 'Pagamento da fatura',
          amount: '120.00',
          date: '2026-09-08T12:00:00.000Z',
          effectiveDate: '2026-09-08T12:00:00.000Z',
          status: 'COMPLETED',
          fromAccount: { id: 9, name: 'Conta pagadora' }
        }
      }]
    }
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices?includePaid=false') {
        return Promise.resolve({ data: [{ ...invoice, paymentAmount: '120.00', outstandingAmount: '330.00' }] })
      }
      if (url === '/financial/accounts') return Promise.resolve({ data: [] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: detailWithPayment })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.delete).mockResolvedValue({ data: undefined })

    render(<CreditCardInvoicesPage />)

    await user.click(await screen.findByRole('button', { name: /Excluir pagamento de/ }))
    const dialog = screen.getByRole('dialog', { name: 'Excluir pagamento' })
    expect(within(dialog).getByText(/O saldo da fatura e das contas sera recalculado/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Excluir pagamento' }))

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/financial/transactions/901')
    })
    expect(addToastMock).toHaveBeenCalledWith(
      'Pagamento excluido e saldos recalculados',
      'success'
    )
  })

  it('antecipa as parcelas futuras selecionadas para a fatura aberta', async () => {
    const user = userEvent.setup()
    const candidates = [
      {
        id: 502,
        description: 'Compra parcelada',
        amount: '100.00',
        installmentNumber: 2,
        totalInstallments: 3,
        purchaseGroupId: 'purchase-1',
        scheduledDate: '2026-10-05',
        creditCardInvoice: {
          id: 102,
          referenceYear: 2026,
          referenceMonth: 10,
          dueDate: '2026-10-17'
        }
      },
      {
        id: 503,
        description: 'Compra parcelada',
        amount: '100.00',
        installmentNumber: 3,
        totalInstallments: 3,
        purchaseGroupId: 'purchase-1',
        scheduledDate: '2026-11-05',
        creditCardInvoice: {
          id: 103,
          referenceYear: 2026,
          referenceMonth: 11,
          dueDate: '2026-11-17'
        }
      }
    ]
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices?includePaid=false') {
        return Promise.resolve({ data: [invoice] })
      }
      if (url === '/financial/accounts') return Promise.resolve({ data: [] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: invoiceDetail })
      }
      if (url === '/financial/credit-card-invoices/101/anticipation-candidates') {
        return Promise.resolve({ data: candidates })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockResolvedValue({ data: { invoice: invoiceDetail } })

    render(<CreditCardInvoicesPage />)

    await user.click(await screen.findByRole('button', { name: 'Antecipar parcelas' }))
    const dialog = await screen.findByRole('dialog', { name: 'Antecipar parcelas' })
    expect(within(dialog).getByText('Compra parcelada (2 de 3)')).toBeInTheDocument()
    expect(within(dialog).getByText('Compra parcelada (3 de 3)')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Antecipar 2 parcelas' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/financial/credit-card-invoices/101/anticipations',
        expect.objectContaining({
          transactionIds: [502, 503],
          discountAmount: 0
        })
      )
    })
    expect(addToastMock).toHaveBeenCalledWith('2 parcelas antecipadas com sucesso', 'success')
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
