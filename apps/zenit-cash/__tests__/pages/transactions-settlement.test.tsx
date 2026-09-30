import type { ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TransactionsListPage from '@/pages/financial/transactions'
import api from '@/lib/api'
import { getTodayDateValue, toIsoDateString } from '@/utils/financialStatus'

const pushMock = vi.fn()
const addToastMock = vi.fn()

vi.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: {}, push: pushMock })
}))

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/Breadcrumb', () => ({ Breadcrumb: () => null }))

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}))

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }
}))

const account = { id: 1, name: 'Conta Corrente', type: 'CHECKING', isActive: true }
const occurrenceDate = '2026-10-15T12:00:00.000Z'

function buildProjection(overrides: Record<string, unknown> = {}) {
  return {
    id: null as number | null,
    description: 'Internet fixa',
    amount: '132.45',
    date: occurrenceDate,
    dueDate: occurrenceDate,
    effectiveDate: null,
    type: 'EXPENSE',
    status: 'PENDING',
    fromAccount: account,
    toAccount: null,
    category: { id: 10, name: 'Moradia', color: '#2563eb' },
    tags: [],
    notes: 'Contrato mensal',
    createdByUser: { id: 1, name: 'Template Fixa' },
    createdAt: occurrenceDate,
    isVirtual: true,
    virtualKey: '7:2026-10',
    fixedTemplateId: 7,
    isFixed: true,
    ...overrides
  }
}

let projection = buildProjection()
let materialized = { ...projection, id: 42, isVirtual: false }
let listedTransactions = [projection]

async function renderPage(overrides: Record<string, unknown> = {}) {
  projection = buildProjection(overrides)
  materialized = { ...projection, id: 42, isVirtual: false }
  listedTransactions = [projection]
  render(<TransactionsListPage />)
  await screen.findByText('Internet fixa')
  return userEvent.setup()
}

describe('TransactionsListPage projected settlement', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/financial/accounts') return { data: [account] }
      if (url === '/financial/categories') return { data: [] }
      if (url === '/preferences/filter-presets') {
        return { data: { presets: [], lastUsedPresetId: null } }
      }
      if (url.startsWith('/financial/transactions?')) {
        return { data: { data: listedTransactions, pages: 1 } }
      }
      if (url === '/financial/transactions/42') return { data: materialized }
      throw new Error(`Unexpected GET: ${url}`)
    })
    vi.mocked(api.post).mockImplementation(async () => {
      listedTransactions = [materialized]
      return { data: { transaction: materialized, created: true } }
    })
    vi.mocked(api.put).mockImplementation(async () => {
      listedTransactions = [{ ...materialized, status: 'COMPLETED' }]
      return { data: {} }
    })
  })

  it.each([
    { type: 'EXPENSE', label: 'Liquidar despesa', title: 'Registrar pagamento', accountField: 'fromAccountId' },
    { type: 'INCOME', label: 'Liquidar receita', title: 'Registrar recebimento', accountField: 'toAccountId' }
  ])('materializes and opens settlement directly for $type', async ({ type, label, title, accountField }) => {
    const user = await renderPage({
      type,
      fromAccount: type === 'EXPENSE' ? account : null,
      toAccount: type === 'INCOME' ? account : null
    })

    await user.click(screen.getByTitle(label))
    const dialog = await screen.findByRole('dialog', { name: title })

    expect(api.post).toHaveBeenCalledExactlyOnceWith(
      '/financial/fixed-transactions/7/materialize', { occurrenceDate }
    )
    expect(api.get).toHaveBeenCalledWith('/financial/transactions/42')
    expect(pushMock).not.toHaveBeenCalled()
    expect(api.put).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('combobox')).toHaveValue('1')
    expect(within(dialog).getByLabelText('Valor da transação')).toHaveValue('132,45')
    expect(dialog.querySelector('input[type="date"]')).toHaveValue(getTodayDateValue())

    fireEvent.input(within(dialog).getByLabelText('Valor da transação'), {
      target: { value: '12000' }
    })
    await user.click(within(dialog).getByRole('button', { name: label }))

    await waitFor(() => expect(api.put).toHaveBeenCalledWith(
      '/financial/transactions/42',
      expect.objectContaining({
        status: 'COMPLETED',
        amount: 120,
        [accountField]: 1,
        date: toIsoDateString(occurrenceDate),
        dueDate: toIsoDateString(occurrenceDate),
        effectiveDate: toIsoDateString(getTodayDateValue()),
        notes: 'Contrato mensal'
      })
    ))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByTitle(label)).not.toBeInTheDocument()
  })

  it('blocks repeated actions while materializing and keeps the pending occurrence when canceled', async () => {
    const user = await renderPage()
    let finishMaterializing!: () => void
    vi.mocked(api.post).mockImplementationOnce(() => new Promise((resolve) => {
      finishMaterializing = () => {
        listedTransactions = [materialized]
        resolve({ data: { transaction: materialized, created: true } })
      }
    }))

    await user.click(screen.getByTitle('Liquidar despesa'))
    expect(screen.getByTitle('Liquidar despesa')).toBeDisabled()
    expect(screen.getByTitle('Materializar e editar')).toBeDisabled()
    expect(screen.getByTitle('Ignorar projeção')).toBeDisabled()
    await user.click(screen.getByTitle('Liquidar despesa'))
    expect(api.post).toHaveBeenCalledTimes(1)

    await act(async () => finishMaterializing())
    const dialog = await screen.findByRole('dialog', { name: 'Registrar pagamento' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))

    expect(api.put).not.toHaveBeenCalled()
    expect(screen.queryByTitle('Materializar e editar')).not.toBeInTheDocument()
    expect(screen.getByTitle('Editar')).toBeInTheDocument()

    await user.click(screen.getByTitle('Liquidar despesa'))
    await screen.findByRole('dialog', { name: 'Registrar pagamento' })
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('shows materialization errors without opening the modal or submitting a settlement', async () => {
    const user = await renderPage()
    vi.mocked(api.post).mockRejectedValueOnce({ response: { data: { error: 'Falha ao materializar' } } })

    await user.click(screen.getByTitle('Liquidar despesa'))

    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith('Falha ao materializar', 'error'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
    expect(screen.getByTitle('Liquidar despesa')).toBeEnabled()
    expect(screen.getByTitle('Materializar e editar')).toBeInTheDocument()
  })

  it('does not reopen settlement when materialization returns an already settled occurrence', async () => {
    const user = await renderPage()
    materialized.status = 'COMPLETED'

    await user.click(screen.getByTitle('Liquidar despesa'))

    await screen.findByTitle('Editar')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Liquidar despesa')).not.toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })

  it.each([
    { type: 'TRANSFER' },
    { status: 'COMPLETED' },
    { archivedAt: occurrenceDate },
    { creditCardInvoice: { referenceYear: 2026, referenceMonth: 10, status: 'OPEN' } }
  ])('keeps settlement unavailable for ineligible projections: %j', async (overrides) => {
    await renderPage(overrides)
    expect(screen.queryByTitle('Liquidar despesa')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Liquidar receita')).not.toBeInTheDocument()
  })

  it('preserves the materialize-and-edit action', async () => {
    const user = await renderPage()
    await user.click(screen.getByTitle('Materializar e editar'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/financial/transactions/42?returnTo=')
    ))
    expect(api.post).toHaveBeenCalledExactlyOnceWith(
      '/financial/fixed-transactions/7/materialize', { occurrenceDate }
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.put).not.toHaveBeenCalled()
  })
})
