import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CreditCardReconciliationPage from '@/pages/financial/credit-cards/[accountId]/reconciliation'
import api from '@/lib/api'

const addToastMock = vi.fn()
const scrollIntoViewMock = vi.fn()

const card = {
  id: 1,
  name: 'Cartao de teste',
  bankName: 'Nubank',
  bankCode: 'NUBANK',
  bank: {
    id: 1,
    code: 'NUBANK',
    name: 'Nubank',
    iconSlug: 'nubank',
    displayOrder: 1,
    isActive: true
  }
}

const invoice = {
  id: 101,
  referenceYear: 2026,
  referenceMonth: 9,
  closingDate: '2026-09-10T12:00:00.000Z',
  dueDate: '2026-09-17T12:00:00.000Z',
  status: 'OPEN',
  isProjected: false,
  projectionKey: null
}

const previousInvoice = {
  ...invoice,
  id: 102,
  referenceMonth: 8,
  closingDate: '2026-08-10T12:00:00.000Z',
  dueDate: '2026-08-17T12:00:00.000Z'
}

const category = {
  id: 7,
  name: 'Categoria de teste',
  color: '#2563eb'
}

const targetInvoiceDetail = {
  ...invoice,
  transactions: [
    {
      id: 501,
      description: 'Mercado no Zenit',
      amount: '100.00',
      installmentNumber: null,
      totalInstallments: null,
      date: '2026-09-02T12:00:00.000Z',
      dueDate: invoice.dueDate,
      isExternalCreditCardSettlement: false,
      isProjected: false,
      isFixedProjection: false,
      fixedTemplateId: null,
      category
    },
    {
      id: 502,
      description: 'Posto no Zenit',
      amount: '80.00',
      installmentNumber: null,
      totalInstallments: null,
      date: '2026-09-03T12:00:00.000Z',
      dueDate: invoice.dueDate,
      isExternalCreditCardSettlement: false,
      isProjected: false,
      isFixedProjection: false,
      fixedTemplateId: null,
      category
    },
    {
      id: 503,
      description: 'Assinatura ambigua no Zenit',
      amount: '59.90',
      installmentNumber: null,
      totalInstallments: null,
      date: '2026-09-04T12:00:00.000Z',
      dueDate: invoice.dueDate,
      isExternalCreditCardSettlement: false,
      isProjected: false,
      isFixedProjection: false,
      fixedTemplateId: null,
      category
    },
    {
      id: 504,
      description: 'Sem correspondencia no Zenit',
      amount: '41.00',
      installmentNumber: null,
      totalInstallments: null,
      date: '2026-09-05T12:00:00.000Z',
      dueDate: invoice.dueDate,
      isExternalCreditCardSettlement: false,
      isProjected: false,
      isFixedProjection: false,
      fixedTemplateId: null,
      category
    },
    {
      id: 505,
      description: 'Assinatura alternativa no Zenit',
      amount: '59.90',
      installmentNumber: null,
      totalInstallments: null,
      date: '2026-09-04T12:00:00.000Z',
      dueDate: invoice.dueDate,
      isExternalCreditCardSettlement: false,
      isProjected: false,
      isFixedProjection: false,
      fixedTemplateId: null,
      category
    },
    {
      id: null,
      description: 'Netflix fixa no Zenit',
      amount: '39.90',
      installmentNumber: null,
      totalInstallments: null,
      date: '2026-09-06T12:00:00.000Z',
      dueDate: invoice.dueDate,
      isExternalCreditCardSettlement: false,
      isProjected: true,
      isFixedProjection: true,
      fixedTemplateId: 77,
      occurrenceKey: '77:2026-09',
      category
    },
    {
      id: null,
      description: 'Netflix fixa futura no Zenit',
      amount: '39.90',
      installmentNumber: null,
      totalInstallments: null,
      date: '2026-10-06T12:00:00.000Z',
      dueDate: '2026-10-17T12:00:00.000Z',
      isExternalCreditCardSettlement: false,
      isProjected: true,
      isFixedProjection: true,
      fixedTemplateId: 77,
      occurrenceKey: '77:2026-10',
      category
    }
  ]
}

const previousTargetInvoiceDetail = {
  ...targetInvoiceDetail,
  ...previousInvoice
}

function matchedTransaction(
  id: number,
  description: string,
  amount: string
) {
  return {
    matchKey: `transaction:${id}`,
    matchSource: 'TRANSACTION' as const,
    id,
    fixedTemplateId: null,
    occurrenceKey: null,
    description,
    amount,
    date: '2026-09-02T12:00:00.000Z',
    status: 'COMPLETED',
    installmentNumber: null,
    totalInstallments: null,
    purchaseGroupId: null,
    invoiceReference: '09/2026',
    invoiceStatus: 'OPEN'
  }
}

function previewItem({
  id,
  sequence,
  description,
  amount,
  matches = [],
  status = 'SIMILAR'
}: {
  id: string
  sequence: number
  description: string
  amount: string
  matches?: ReturnType<typeof matchedTransaction>[] | Array<Record<string, unknown>>
  status?: 'SIMILAR' | 'PENDING'
}) {
  return {
    id,
    sequence,
    status,
    reason: status === 'PENDING' ? 'NO_MATCH' : 'DATE_DIVERGENCE',
    kind: 'PURCHASE',
    direction: 'DEBIT',
    amount,
    signedAmount: `-${amount}`,
    purchaseDate: '2026-09-02T12:00:00.000Z',
    datePrecision: 'PURCHASE_DATE',
    installmentNumber: null,
    totalInstallments: null,
    sourceDescription: description,
    sourceSection: 'PURCHASES',
    cardSuffix: '1234',
    canImport: true,
    nonImportableReason: null,
    categorySuggestion: {
      categoryId: category.id,
      categoryName: category.name,
      categoryColor: category.color,
      categoryIcon: null,
      source: 'RULE',
      reason: 'Categoria anterior'
    },
    matchedTransactions: matches
  }
}

const fixedMatch = {
  matchKey: 'projected-fixed:77:77:2026-09',
  matchSource: 'PROJECTED_FIXED' as const,
  id: null,
  fixedTemplateId: 77,
  occurrenceKey: '77:2026-09',
  description: 'Netflix fixa no Zenit',
  amount: '39.90',
  date: '2026-09-06T12:00:00.000Z',
  status: 'PENDING',
  installmentNumber: null,
  totalInstallments: null,
  purchaseGroupId: null,
  invoiceReference: '09/2026',
  invoiceStatus: 'OPEN'
}

const previewItems = [
  previewItem({
    id: 'bank-market',
    sequence: 1,
    description: 'Mercado no arquivo',
    amount: '100.00',
    matches: [matchedTransaction(501, 'Mercado no Zenit', '100.00')]
  }),
  previewItem({
    id: 'bank-gas',
    sequence: 2,
    description: 'Posto no arquivo',
    amount: '80.00',
    matches: [matchedTransaction(502, 'Posto no Zenit', '80.00')]
  }),
  previewItem({
    id: 'bank-ambiguous-a',
    sequence: 3,
    description: 'Assinatura ambigua A no arquivo',
    amount: '59.90',
    matches: [
      matchedTransaction(503, 'Assinatura ambigua no Zenit', '59.90'),
      matchedTransaction(505, 'Assinatura alternativa no Zenit', '59.90')
    ]
  }),
  previewItem({
    id: 'bank-ambiguous-b',
    sequence: 4,
    description: 'Assinatura ambigua B no arquivo',
    amount: '59.90',
    matches: [matchedTransaction(503, 'Assinatura ambigua no Zenit', '59.90')]
  }),
  previewItem({
    id: 'bank-fixed',
    sequence: 5,
    description: 'Netflix no arquivo',
    amount: '39.90',
    matches: [fixedMatch]
  }),
  previewItem({
    id: 'bank-pending',
    sequence: 6,
    description: 'Pendente no arquivo',
    amount: '25.00',
    status: 'PENDING'
  })
]

const preview = {
  statement: {
    sourceType: 'NUBANK_CSV',
    fileName: 'fatura.csv',
    dueDate: invoice.dueDate,
    totalAmount: '364.70',
    parsedNetAmount: '-364.70',
    referenceYear: 2026,
    referenceMonth: 9
  },
  summary: {
    totalItems: previewItems.length,
    okCount: 0,
    similarCount: 5,
    pendingCount: 1,
    notImportableCount: 0,
    importableCount: previewItems.length,
    importableAmount: '-364.70',
    okAmount: '0.00',
    similarAmount: '-339.70',
    pendingAmount: '-25.00',
    notImportableAmount: '0.00'
  },
  items: previewItems
}

const reconciliationSession = {
  id: 301,
  accountId: 1,
  referenceYear: 2026,
  referenceMonth: 9,
  sourceType: 'NUBANK_CSV',
  fileName: 'fatura.csv',
  fileHash: 'sha256-fatura',
  status: 'OPEN',
  revision: 1,
  createdBy: 11,
  updatedBy: 11,
  completedAt: null,
  completedBy: null,
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z'
}

type ItemResolution =
  | 'PENDING'
  | 'IMPORTED'
  | 'LINKED_FIXED'
  | 'CONFIRMED_EXISTING'
  | 'IGNORED'

function buildWorkspace({
  sourcePreview = preview,
  referenceMonth = sourcePreview.statement.referenceMonth,
  revision = 1,
  status = 'OPEN',
  resolutions = {},
  transactionIds = {},
  resolutionData = {}
}: {
  sourcePreview?: any
  referenceMonth?: number
  revision?: number
  status?: 'OPEN' | 'COMPLETED'
  resolutions?: Record<string, ItemResolution>
  transactionIds?: Record<string, number[]>
  resolutionData?: Record<string, Record<string, unknown>>
} = {}) {
  const items = sourcePreview.items.map((item: any) => {
    const resolution = resolutions[item.id] || 'PENDING'
    const terminal = item.status === 'NOT_IMPORTABLE' || resolution !== 'PENDING'

    return {
      ...item,
      progress: {
        itemId: item.id,
        identityKey: `identity:${item.id}`,
        resolution,
        resolutionData: resolutionData[item.id] || null,
        terminal,
        transactionIds: transactionIds[item.id] || [],
        resolvedAt: resolution === 'PENDING' ? null : '2026-09-09T13:00:00.000Z',
        resolvedBy: resolution === 'PENDING' ? null : 11
      }
    }
  })
  const resolutionValues: ItemResolution[] = items.map(
    (item: any) => item.progress.resolution
  )
  const count = (resolution: ItemResolution) =>
    resolutionValues.filter((value: ItemResolution) => value === resolution).length

  return {
    session: {
      ...reconciliationSession,
      id: referenceMonth === 9 ? 301 : 302,
      referenceMonth,
      revision,
      status,
      completedAt: status === 'COMPLETED' ? '2026-09-09T14:00:00.000Z' : null,
      completedBy: status === 'COMPLETED' ? 11 : null
    },
    preview: {
      ...sourcePreview,
      items
    },
    progress: {
      totalCount: items.length,
      resolvedCount: items.filter((item: any) => item.progress.terminal).length,
      pendingCount: items.filter((item: any) => !item.progress.terminal).length,
      importedCount: count('IMPORTED'),
      linkedFixedCount: count('LINKED_FIXED'),
      confirmedExistingCount: count('CONFIRMED_EXISTING'),
      ignoredCount: count('IGNORED')
    },
    events: []
  }
}

const openWorkspace = buildWorkspace()

vi.mock('next/router', () => ({
  useRouter: () => ({
    isReady: true,
    pathname: '/financial/credit-cards/[accountId]/reconciliation',
    query: { accountId: '1' },
    replace: vi.fn()
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
  Card: ({ children, className = '' }: { children: ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  )
}))

vi.mock('@/components/ui/AutoCompleteInput', () => ({
  AutocompleteInput: ({
    value,
    onChange,
    placeholder,
    disabled
  }: {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
  }) => (
    <input
      value={value}
      aria-label={placeholder || 'Descricao'}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}))

vi.mock('@/components/financial/CategorySelect', () => ({
  default: ({
    value,
    onChange,
    disabled
  }: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
  }) => (
    <select
      aria-label="Categoria do lancamento"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Selecione</option>
      <option value="7">Categoria de teste</option>
    </select>
  )
}))

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}))

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}))

async function renderAnalyzedPage({
  targetInvoiceKey
}: {
  targetInvoiceKey?: string
} = {}) {
  const user = userEvent.setup()
  render(<CreditCardReconciliationPage />)

  await screen.findByText('Escolher arquivo')
  if (targetInvoiceKey) {
    const targetInvoiceSelect = screen.getByRole('combobox')
    await waitFor(() => expect(targetInvoiceSelect).toBeEnabled())
    await user.selectOptions(targetInvoiceSelect, targetInvoiceKey)
    expect(targetInvoiceSelect).toHaveValue(targetInvoiceKey)
  }

  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  await waitFor(() => expect(fileInput).toBeEnabled())
  await user.upload(fileInput, new File(['date,description,amount'], 'fatura.csv', {
    type: 'text/csv'
  }))

  const analyzeButton = screen.getByRole('button', { name: 'Analisar fatura' })
  await waitFor(() => expect(analyzeButton).toBeEnabled())
  await user.click(analyzeButton)
  await screen.findByText('Mercado no arquivo')

  return user
}

async function openSideBySideView() {
  const user = await renderAnalyzedPage()
  await user.click(screen.getByRole('button', { name: 'Visualização lado a lado' }))

  return {
    user,
    zenitRegion: screen.getByRole('region', { name: 'Lançamentos da fatura no Zenit' }),
    fileRegion: screen.getByRole('region', { name: 'Itens do arquivo da fatura' })
  }
}

function getFileItem(region: HTMLElement, itemId: string) {
  const item = region.querySelector(`[data-reconciliation-item-id="${itemId}"]`)
  expect(item).toBeTruthy()
  return item as HTMLElement
}

function getFileSelectionButton(region: HTMLElement, itemId: string, name: RegExp) {
  const item = getFileItem(region, itemId)
  const button = within(item).getByRole('button', { name })
  const checkbox = within(item).getByRole('checkbox')

  expect(button).not.toContainElement(checkbox)
  return button
}

function getZenitItem(region: HTMLElement, transactionKey: string) {
  const item = region.querySelector(
    `[data-reconciliation-transaction-key="${transactionKey}"]`
  )
  expect(item).toBeTruthy()
  return item as HTMLElement
}

function expectRegionToHaveOwnScroll(region: HTMLElement) {
  expect(region.className).toContain('min-h-0')
  expect(region.className).toMatch(/overflow-(?:auto|y-auto|y-scroll)/)
  expect(region.className).toContain('overscroll-contain')
}

describe('CreditCardReconciliationPage comparison views', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scrollIntoViewMock.mockReset()
    Element.prototype.scrollIntoView = scrollIntoViewMock

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') {
        return Promise.resolve({ data: [card] })
      }

      if (url === '/financial/credit-cards/1/invoices') {
        return Promise.resolve({ data: [invoice] })
      }

      if (url === '/financial/categories') {
        return Promise.resolve({ data: [category] })
      }

      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }

      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({
          data: { session: null, preview: null, progress: null, events: [] }
        })
      }

      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards/1/reconciliation/sessions') {
        return Promise.resolve({ data: openWorkspace })
      }

      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('mantem a troca valida de arquivo e bloqueia nova escolha enquanto a previa esta pendente', async () => {
    const pendingReads: Array<{
      reader: {
        result: string | ArrayBuffer | null
        onload: ((event: ProgressEvent<FileReader>) => void) | null
      }
      file: File
    }> = []

    class ControlledFileReader {
      result: string | ArrayBuffer | null = null
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null
      onerror: ((event: ProgressEvent<FileReader>) => void) | null = null

      readAsDataURL(file: File) {
        pendingReads.push({ reader: this, file })
      }
    }

    vi.stubGlobal('FileReader', ControlledFileReader)

    let resolvePreview: ((value: { data: typeof openWorkspace }) => void) | undefined
    let previewRequestBody: Record<string, unknown> | undefined
    vi.mocked(api.post).mockImplementation((url: string, body?: unknown) => {
      if (url === '/financial/credit-cards/1/reconciliation/sessions') {
        previewRequestBody = body as Record<string, unknown>
        return new Promise((resolve) => {
          resolvePreview = resolve
        })
      }

      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    await screen.findByText('Escolher arquivo')
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await waitFor(() => expect(fileInput).toBeEnabled())
    const oldFile = new File(['old'], 'fatura-antiga.csv', { type: 'text/csv' })
    const currentFile = new File(['current'], 'fatura-atual.csv', { type: 'text/csv' })

    await user.upload(fileInput, oldFile)
    await user.upload(fileInput, currentFile)
    expect(pendingReads.map(({ file }) => file.name)).toEqual([
      'fatura-antiga.csv',
      'fatura-atual.csv'
    ])

    await act(async () => {
      pendingReads[1]!.reader.result = 'data:text/csv;base64,Y3VycmVudA=='
      pendingReads[1]!.reader.onload?.({} as ProgressEvent<FileReader>)
    })
    await act(async () => {
      pendingReads[0]!.reader.result = 'data:text/csv;base64,b2xk'
      pendingReads[0]!.reader.onload?.({} as ProgressEvent<FileReader>)
    })

    expect(screen.getByText('fatura-atual.csv')).toBeInTheDocument()
    const analyzeButton = screen.getByRole('button', { name: 'Analisar fatura' })
    await waitFor(() => expect(analyzeButton).toBeEnabled())
    await user.click(analyzeButton)

    await waitFor(() => expect(fileInput).toBeDisabled())
    expect(screen.getByRole('button', { name: 'Analisando' })).toBeDisabled()
    expect(previewRequestBody).toMatchObject({
      fileName: 'fatura-atual.csv',
      fileBase64: 'data:text/csv;base64,Y3VycmVudA=='
    })

    await act(async () => {
      resolvePreview?.({ data: openWorkspace })
    })
    await screen.findByText('Mercado no arquivo')
    await waitFor(() => expect(fileInput).not.toBeInTheDocument())
    expect(
      screen.getByRole('region', { name: 'Resumo da fatura em conciliação' })
    ).toBeInTheDocument()
  })

  it('invalida a sessao atrasada quando a referencia automatica passa a estar paga', async () => {
    const now = new Date()
    const currentReferenceYear = now.getFullYear()
    const currentReferenceMonth = now.getMonth() + 1
    const previousReference = new Date(currentReferenceYear, currentReferenceMonth - 2, 1)
    const previousReferenceYear = previousReference.getFullYear()
    const previousReferenceMonth = previousReference.getMonth() + 1
    const currentKey = `${currentReferenceYear}-${String(currentReferenceMonth).padStart(2, '0')}`
    const previousKey = `${previousReferenceYear}-${String(previousReferenceMonth).padStart(2, '0')}`
    const cardWithCycle = {
      ...card,
      statementClosingDay: 31,
      statementDueDay: 31
    }
    const paidCurrentInvoice = {
      ...invoice,
      id: 201,
      referenceYear: currentReferenceYear,
      referenceMonth: currentReferenceMonth,
      status: 'PAID'
    }
    const fallbackInvoice = {
      ...invoice,
      id: 202,
      referenceYear: previousReferenceYear,
      referenceMonth: previousReferenceMonth,
      status: 'CLOSED'
    }
    const stalePreview = {
      ...preview,
      statement: {
        ...preview.statement,
        fileName: 'arquivo-da-referencia-removida.csv',
        referenceYear: currentReferenceYear,
        referenceMonth: currentReferenceMonth
      },
      items: [
        {
          ...previewItems[0],
          id: 'stale-paid-item',
          sourceDescription: 'Item da referencia paga removida'
        }
      ],
      summary: {
        ...preview.summary,
        totalItems: 1,
        similarCount: 1,
        pendingCount: 0,
        importableCount: 1
      }
    }
    const staleWorkspace = buildWorkspace({
      sourcePreview: stalePreview,
      referenceMonth: currentReferenceMonth
    })
    staleWorkspace.session.referenceYear = currentReferenceYear
    staleWorkspace.session.fileName = 'arquivo-da-referencia-removida.csv'

    let resolveInvoices!: (value: { data: Array<typeof paidCurrentInvoice> }) => void
    const invoicesRequest = new Promise<{ data: Array<typeof paidCurrentInvoice> }>((resolve) => {
      resolveInvoices = resolve
    })
    let resolveStaleSession!: (value: { data: typeof staleWorkspace }) => void
    const staleSessionRequest = new Promise<{ data: typeof staleWorkspace }>((resolve) => {
      resolveStaleSession = resolve
    })
    let resolveFallbackSession!: (value: {
      data: { session: null; preview: null; progress: null; events: never[] }
    }) => void
    const fallbackSessionRequest = new Promise<{
      data: { session: null; preview: null; progress: null; events: never[] }
    }>((resolve) => {
      resolveFallbackSession = resolve
    })
    const staleSessionUrl = `/financial/credit-cards/1/reconciliation/sessions/${currentReferenceYear}/${currentReferenceMonth}`
    const fallbackSessionUrl = `/financial/credit-cards/1/reconciliation/sessions/${previousReferenceYear}/${previousReferenceMonth}`

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [cardWithCycle] })
      if (url === '/financial/credit-cards/1/invoices') return invoicesRequest
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === staleSessionUrl) return staleSessionRequest
      if (url === fallbackSessionUrl) return fallbackSessionRequest
      if (url === '/financial/credit-card-invoices/202') {
        return Promise.resolve({ data: { ...fallbackInvoice, transactions: [] } })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    render(<CreditCardReconciliationPage />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(staleSessionUrl))

    await act(async () => {
      resolveInvoices({ data: [paidCurrentInvoice, fallbackInvoice] })
    })

    const targetInvoiceSelect = screen.getByRole('combobox')
    await waitFor(() => expect(targetInvoiceSelect).toHaveValue(previousKey))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(fallbackSessionUrl))
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeDisabled()

    await act(async () => {
      resolveStaleSession({ data: staleWorkspace })
    })
    expect(screen.queryByText('Item da referencia paga removida')).not.toBeInTheDocument()
    expect(fileInput).toBeDisabled()

    await act(async () => {
      resolveFallbackSession({
        data: { session: null, preview: null, progress: null, events: [] }
      })
    })
    await waitFor(() => expect(fileInput).toBeEnabled())
    expect(targetInvoiceSelect).toHaveValue(previousKey)
    expect(targetInvoiceSelect).not.toHaveValue(currentKey)
    expect(screen.queryByText('Item da referencia paga removida')).not.toBeInTheDocument()
  })

  it('mantem o modo detalhado como padrao e preserva o foco ao alternar a visualizacao', async () => {
    const user = await renderAnalyzedPage()

    expect(screen.getAllByText('Na fatura do banco')).not.toHaveLength(0)
    expect(screen.getAllByText('No Zenit')).not.toHaveLength(0)
    expect(
      screen.queryByRole('region', { name: 'Lançamentos da fatura no Zenit' })
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Visualização lado a lado' }))

    const zenitRegion = screen.getByRole('region', {
      name: 'Lançamentos da fatura no Zenit'
    })
    const fileRegion = screen.getByRole('region', { name: 'Itens do arquivo da fatura' })
    expectRegionToHaveOwnScroll(zenitRegion)
    expectRegionToHaveOwnScroll(fileRegion)
    expect(
      fileRegion.compareDocumentPosition(zenitRegion) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)

    const marketFileButton = getFileSelectionButton(
      fileRegion,
      'bank-market',
      /Mercado no arquivo/
    )
    await user.click(marketFileButton)
    expect(marketFileButton).toHaveAttribute('aria-pressed', 'true')
    expect(getZenitItem(zenitRegion, 'transaction:501')).toHaveAttribute(
      'data-reconciliation-highlighted',
      'true'
    )

    await user.click(screen.getByRole('button', { name: 'Visualização detalhada' }))
    expect(screen.getAllByText('Na fatura do banco')).not.toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Visualização lado a lado' }))

    const restoredZenitRegion = screen.getByRole('region', {
      name: 'Lançamentos da fatura no Zenit'
    })
    const restoredFileRegion = screen.getByRole('region', {
      name: 'Itens do arquivo da fatura'
    })
    expect(
      getFileSelectionButton(restoredFileRegion, 'bank-market', /Mercado no arquivo/)
    ).toHaveAttribute('aria-pressed', 'true')
    expect(getZenitItem(restoredZenitRegion, 'transaction:501')).toHaveAttribute(
      'data-reconciliation-highlighted',
      'true'
    )
  })

  it('mantem o painel mobile no Zenit enquanto o detalhe carrega e destaca ao concluir', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query === '(max-width: 1023px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(() => false)
      }))
    )

    let resolveTargetInvoiceDetail:
      | ((value: { data: typeof targetInvoiceDetail }) => void)
      | undefined
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') {
        return Promise.resolve({ data: [card] })
      }

      if (url === '/financial/credit-cards/1/invoices') {
        return Promise.resolve({ data: [invoice] })
      }

      if (url === '/financial/categories') {
        return Promise.resolve({ data: [category] })
      }

      if (url === '/financial/credit-card-invoices/101') {
        return new Promise((resolve) => {
          resolveTargetInvoiceDetail = resolve
        })
      }

      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    const user = await renderAnalyzedPage()
    await user.click(screen.getByRole('button', { name: 'Visualização lado a lado' }))

    const panelTabs = screen.getByRole('group', { name: 'Painel da comparação' })
    const fileTab = within(panelTabs).getByRole('button', { name: 'Fatura' })
    const zenitTab = within(panelTabs).getByRole('button', { name: 'Zenit' })
    const fileRegion = screen.getByRole('region', { name: 'Itens do arquivo da fatura' })

    expect(fileTab).toHaveAttribute('aria-pressed', 'true')
    await user.click(
      getFileSelectionButton(fileRegion, 'bank-market', /Mercado no arquivo/)
    )

    expect(zenitTab).toHaveAttribute('aria-pressed', 'true')
    expect(fileTab).toHaveAttribute('aria-pressed', 'false')
    expect(
      screen.getByLabelText('Carregando lançamentos do Zenit')
    ).toBeInTheDocument()
    const comparisonStatus = screen.getByRole('status')
    expect(comparisonStatus).toHaveTextContent(
      'Carregando os lançamentos do Zenit para localizar a correspondência.'
    )
    expect(comparisonStatus).not.toHaveTextContent(
      'Nenhuma correspondência foi encontrada no Zenit para este item.'
    )

    await act(async () => {
      resolveTargetInvoiceDetail?.({ data: targetInvoiceDetail })
    })

    const zenitRegion = screen.getByRole('region', {
      name: 'Lançamentos da fatura no Zenit'
    })
    await waitFor(() =>
      expect(getZenitItem(zenitRegion, 'transaction:501')).toHaveAttribute(
        'data-reconciliation-highlighted',
        'true'
      )
    )
    expect(zenitTab).toHaveAttribute('aria-pressed', 'true')
    expect(comparisonStatus).not.toHaveTextContent(
      'Nenhuma correspondência foi encontrada no Zenit para este item.'
    )
  })

  it('mantem os lancamentos Zenit fora da sequencia normal de Tab', async () => {
    const { zenitRegion } = await openSideBySideView()
    const zenitItems = Array.from(
      zenitRegion.querySelectorAll('[data-reconciliation-transaction-key]')
    )

    expect(zenitItems.length).toBeGreaterThan(0)
    zenitItems.forEach((item) => {
      expect(item).toHaveAttribute('tabindex', '-1')
    })
  })

  it('mantem selecao unica, move o destaque e nao altera os itens marcados para importar', async () => {
    const { user, zenitRegion, fileRegion } = await openSideBySideView()
    const marketItem = getFileItem(fileRegion, 'bank-market')
    const pendingItem = getFileItem(fileRegion, 'bank-pending')
    const marketButton = getFileSelectionButton(
      fileRegion,
      'bank-market',
      /Mercado no arquivo/
    )
    const gasButton = getFileSelectionButton(fileRegion, 'bank-gas', /Posto no arquivo/)
    const unmatchedButton = getFileSelectionButton(
      fileRegion,
      'bank-pending',
      /Pendente no arquivo/
    )
    const marketZenitItem = getZenitItem(zenitRegion, 'transaction:501')
    const gasZenitItem = getZenitItem(zenitRegion, 'transaction:502')
    const marketImportCheckbox = within(marketItem).getByRole('checkbox')
    const pendingImportCheckbox = within(pendingItem).getByRole('checkbox')

    expect(within(zenitRegion).getAllByRole('button')).toHaveLength(7)
    expect(marketImportCheckbox).not.toBeChecked()
    expect(pendingImportCheckbox).not.toBeChecked()

    await user.click(marketButton)

    expect(marketButton).toHaveAttribute('aria-pressed', 'true')
    expect(marketZenitItem).toHaveAttribute('data-reconciliation-highlighted', 'true')
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled())
    expect(scrollIntoViewMock.mock.contexts).toContain(marketZenitItem)
    expect(marketImportCheckbox).not.toBeChecked()
    expect(pendingImportCheckbox).not.toBeChecked()

    scrollIntoViewMock.mockClear()
    await user.click(gasButton)

    expect(marketButton).toHaveAttribute('aria-pressed', 'false')
    expect(gasButton).toHaveAttribute('aria-pressed', 'true')
    expect(marketZenitItem).toHaveAttribute('data-reconciliation-highlighted', 'false')
    expect(gasZenitItem).toHaveAttribute('data-reconciliation-highlighted', 'true')
    await waitFor(() => expect(scrollIntoViewMock.mock.contexts).toContain(gasZenitItem))

    await user.click(unmatchedButton)

    expect(gasButton).toHaveAttribute('aria-pressed', 'false')
    expect(unmatchedButton).toHaveAttribute('aria-pressed', 'true')
    expect(
      zenitRegion.querySelectorAll('[data-reconciliation-highlighted="true"]')
    ).toHaveLength(0)
    expect(marketImportCheckbox).not.toBeChecked()
    expect(pendingImportCheckbox).not.toBeChecked()
    expect(api.post).toHaveBeenCalledTimes(1)
  })

  it('marca e desmarca todos os itens importaveis independentemente do filtro', async () => {
    const user = await renderAnalyzedPage()

    expect(screen.getByRole('button', { name: 'Importar 0 selecionado(s)' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Similares (5)' }))
    expect(screen.queryByText('Pendente no arquivo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Marcar tudo' }))

    expect(screen.getByRole('button', { name: 'Importar 6 selecionado(s)' })).toBeEnabled()
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).toBeChecked())

    await user.click(screen.getByRole('button', { name: 'Desmarcar tudo' }))

    expect(screen.getByRole('button', { name: 'Importar 0 selecionado(s)' })).toBeDisabled()
    screen.getAllByRole('checkbox').forEach((checkbox) => expect(checkbox).not.toBeChecked())

    await user.click(screen.getByRole('button', { name: 'Todos (6)' }))
    const pendingCard = screen.getByText('Pendente no arquivo').closest('section') as HTMLElement
    expect(within(pendingCard).getByRole('checkbox')).not.toBeChecked()
  })

  it('destaca todas as correspondencias ambiguas e reconhece fixa projetada', async () => {
    const { user, zenitRegion, fileRegion } = await openSideBySideView()
    const ambiguousButton = getFileSelectionButton(
      fileRegion,
      'bank-ambiguous-a',
      /Assinatura ambigua A no arquivo/
    )
    const ambiguousZenitItem = getZenitItem(zenitRegion, 'transaction:503')
    const alternativeZenitItem = getZenitItem(zenitRegion, 'transaction:505')

    await user.click(ambiguousButton)

    expect(ambiguousButton).toHaveAttribute('aria-pressed', 'true')
    expect(ambiguousZenitItem).toHaveAttribute(
      'data-reconciliation-highlighted',
      'true'
    )
    expect(alternativeZenitItem).toHaveAttribute(
      'data-reconciliation-highlighted',
      'true'
    )
    expect(
      screen.getAllByText(/mais de uma correspond.ncia|m.ltiplas correspond.ncias/i)
    ).not.toHaveLength(0)

    scrollIntoViewMock.mockClear()
    const fixedButton = getFileSelectionButton(
      fileRegion,
      'bank-fixed',
      /Netflix no arquivo/
    )
    await user.click(fixedButton)

    const fixedZenitItem = getZenitItem(
      zenitRegion,
      'projected-fixed:77:77:2026-09'
    )
    const futureFixedZenitItem = getZenitItem(
      zenitRegion,
      'projected-fixed:77:77:2026-10'
    )
    expect(ambiguousButton).toHaveAttribute('aria-pressed', 'false')
    expect(fixedButton).toHaveAttribute('aria-pressed', 'true')
    expect(ambiguousZenitItem).toHaveAttribute(
      'data-reconciliation-highlighted',
      'false'
    )
    expect(alternativeZenitItem).toHaveAttribute(
      'data-reconciliation-highlighted',
      'false'
    )
    expect(fixedZenitItem).toHaveAttribute('data-reconciliation-highlighted', 'true')
    expect(futureFixedZenitItem).toHaveAttribute(
      'data-reconciliation-highlighted',
      'false'
    )
    await waitFor(() =>
      expect(scrollIntoViewMock.mock.contexts).toContain(fixedZenitItem)
    )
  })

  it('atualiza as faturas e preserva a referencia apos commit sem reenviar o arquivo', async () => {
    const invoiceListResponses = [
      [invoice, previousInvoice],
      [invoice, previousInvoice]
    ]
    const previousPreview = {
      ...preview,
      statement: {
        ...preview.statement,
        dueDate: previousInvoice.dueDate,
        referenceMonth: previousInvoice.referenceMonth
      }
    }
    const previousWorkspace = buildWorkspace({
      sourcePreview: previousPreview,
      referenceMonth: 8
    })
    const importedWorkspace = {
      ...buildWorkspace({
        sourcePreview: previousPreview,
        referenceMonth: 8,
        revision: 2,
        resolutions: { 'bank-pending': 'IMPORTED' }
      }),
      commitResult: {
        statement: previousPreview.statement,
        summary: {
          selectedCount: 1,
          createdCount: 1,
          linkedFixedCount: 0,
          skippedDuplicateCount: 0,
          skippedNotImportableCount: 0,
          failedCount: 0
        },
        results: [
          {
            itemId: 'bank-pending',
            status: 'CREATED',
            message: 'Lancamento criado',
            createdTransactionIds: [901]
          }
        ]
      }
    }
    let committed = false

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') {
        return Promise.resolve({ data: invoiceListResponses.shift() || [invoice, previousInvoice] })
      }
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-card-invoices/102') {
        return Promise.resolve({ data: previousTargetInvoiceDetail })
      }
      if (url.startsWith('/financial/credit-cards/1/reconciliation/sessions/2026/')) {
        if (url.endsWith('/8') && committed) {
          return Promise.resolve({ data: importedWorkspace })
        }
        return Promise.resolve({
          data: { session: null, preview: null, progress: null, events: [] }
        })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards/1/reconciliation/sessions') {
        return Promise.resolve({ data: previousWorkspace })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/302/commit') {
        committed = true
        return Promise.resolve({ data: importedWorkspace })
      }
      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })

    const user = await renderAnalyzedPage({ targetInvoiceKey: '2026-08' })
    const summary = screen.getByRole('region', { name: 'Resumo da fatura em conciliação' })
    const pendingCard = screen.getByText('Pendente no arquivo').closest('section')

    await user.click(
      within(pendingCard as HTMLElement).getByRole('button', { name: 'Importar este item' })
    )

    await waitFor(() => expect(within(summary).getByText('08/2026')).toBeInTheDocument())
    expect(screen.queryByRole('option', { name: /08\/2026/ })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(
        vi.mocked(api.get).mock.calls.filter(
          ([url]) => url === '/financial/credit-cards/1/invoices'
        )
      ).toHaveLength(2)
    })

    const commitCall = vi.mocked(api.post).mock.calls.find(
      ([url]) => url === '/financial/credit-cards/1/reconciliation/sessions/302/commit'
    )
    expect(commitCall?.[1]).toEqual({
      expectedRevision: 1,
      selectedItems: [
        expect.objectContaining({ itemId: 'bank-pending', action: 'IMPORT' })
      ]
    })
    expect(commitCall?.[1]).not.toHaveProperty('fileBase64')
    expect(await screen.findByText('Importado')).toBeInTheDocument()
    expect(addToastMock).toHaveBeenCalledWith('Lancamento criado', 'success')
    expect(
      vi.mocked(api.get).mock.calls.filter(
        ([url]) => url === '/financial/credit-cards/1/reconciliation/sessions/2026/8'
      )
    ).toHaveLength(1)
  })

  it.each([
    ['FAILED', 'Falha ao criar o lancamento'],
    ['SKIPPED_DUPLICATE', 'Duplicidade encontrada; revise a correspondencia']
  ] as const)(
    'mantem item pendente e mostra o resultado real quando o commit retorna %s',
    async (resultStatus, resultMessage) => {
      const resultWorkspace = {
        ...buildWorkspace({ revision: 2 }),
        commitResult: {
          statement: preview.statement,
          summary: {
            selectedCount: 1,
            createdCount: 0,
            linkedFixedCount: 0,
            skippedDuplicateCount: resultStatus === 'SKIPPED_DUPLICATE' ? 1 : 0,
            skippedNotImportableCount: 0,
            failedCount: resultStatus === 'FAILED' ? 1 : 0
          },
          results: [
            {
              itemId: 'bank-pending',
              status: resultStatus,
              message: resultMessage,
              createdTransactionIds: []
            }
          ]
        }
      }
      vi.mocked(api.post).mockImplementation((url: string) => {
        if (url === '/financial/credit-cards/1/reconciliation/sessions') {
          return Promise.resolve({ data: openWorkspace })
        }
        if (url === '/financial/credit-cards/1/reconciliation/sessions/301/commit') {
          return Promise.resolve({ data: resultWorkspace })
        }
        return Promise.reject(new Error(`Unexpected POST request: ${url}`))
      })

      const user = await renderAnalyzedPage()
      const pendingCard = screen.getByText('Pendente no arquivo').closest('section') as HTMLElement
      await user.click(
        within(pendingCard).getByRole('button', { name: 'Importar este item' })
      )

      await waitFor(() => expect(addToastMock).toHaveBeenCalledWith(resultMessage, 'error'))
      expect(addToastMock).not.toHaveBeenCalledWith(
        expect.stringMatching(/importado|criado e andamento salvo/i),
        'success'
      )
      const resultRegion = await screen.findByRole('region', {
        name: 'Resultado do ultimo processamento'
      })
      expect(within(resultRegion).getByText(resultMessage)).toBeInTheDocument()
      expect(within(pendingCard).getByRole('checkbox')).not.toBeChecked()
    }
  )

  it('trata retry de alias fixo ja mapeado como sucesso terminal idempotente', async () => {
    const resultMessage = 'A alias desta fixa ja estava mapeada'
    const linkedWorkspace = {
      ...buildWorkspace({
        revision: 2,
        resolutions: { 'bank-fixed': 'LINKED_FIXED' }
      }),
      commitResult: {
        statement: preview.statement,
        summary: {
          selectedCount: 1,
          createdCount: 0,
          linkedFixedCount: 0,
          skippedDuplicateCount: 1,
          skippedNotImportableCount: 0,
          failedCount: 0
        },
        results: [
          {
            itemId: 'bank-fixed',
            status: 'SKIPPED_DUPLICATE',
            message: resultMessage,
            createdTransactionIds: []
          }
        ]
      }
    }
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards/1/reconciliation/sessions') {
        return Promise.resolve({ data: openWorkspace })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/301/commit') {
        return Promise.resolve({ data: linkedWorkspace })
      }
      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })

    const user = await renderAnalyzedPage()
    const fixedCard = screen.getByText('Netflix no arquivo').closest('section') as HTMLElement
    await user.click(within(fixedCard).getByRole('button', { name: 'Vincular a fixa' }))

    await waitFor(() => expect(addToastMock).toHaveBeenCalledWith(resultMessage, 'success'))
    expect(addToastMock).not.toHaveBeenCalledWith(resultMessage, 'error')
    expect(await screen.findByText('Fixa vinculada')).toBeInTheDocument()
    const resultRegion = screen.getByRole('region', {
      name: 'Resultado do ultimo processamento'
    })
    expect(within(resultRegion).getByText('Fixa ja vinculada')).toBeInTheDocument()
    expect(within(resultRegion).getByText(resultMessage)).toBeInTheDocument()
  })

  it('retoma automaticamente o andamento salvo da referencia sem novo upload', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: openWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    render(<CreditCardReconciliationPage />)

    expect(await screen.findByText('Mercado no arquivo')).toBeInTheDocument()
    expect(screen.getByText('Em andamento')).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Resumo da fatura em conciliação' })
    expect(within(summary).getByText('09/2026')).toBeInTheDocument()
    expect(within(summary).getByText('R$ 364,70')).toBeInTheDocument()
    expect(screen.queryByText('Escolher arquivo')).not.toBeInTheDocument()
    expect(screen.queryByText('Fatura-alvo da conciliacao')).not.toBeInTheDocument()
    expect(screen.queryByText('Correspondencias encontradas')).not.toBeInTheDocument()
    expect(screen.queryByText(/similar\(es\)/)).not.toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
  })

  it('substitui arquivo conflitante somente com confirmacao e protecao de sessao e revisao', async () => {
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({
          data: { session: null, preview: null, progress: null, events: [] }
        })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post)
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: {
            code: 'SESSION_FILE_CONFLICT',
            currentSessionId: 301,
            currentRevision: 1
          }
        }
      })
      .mockResolvedValueOnce({ data: buildWorkspace({ revision: 2 }) })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    await screen.findByText('Escolher arquivo')
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await user.upload(fileInput, new File(['new'], 'nova-fatura.csv', { type: 'text/csv' }))
    await user.click(screen.getByRole('button', { name: 'Analisar fatura' }))

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.post).mock.calls[1]?.[1]).toMatchObject({
      replace: true,
      expectedSessionId: 301,
      expectedRevision: 1,
      fileName: 'nova-fatura.csv'
    })
  })

  it('permite selecionar novamente o mesmo arquivo depois de cancelar a substituicao', async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirmMock)
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({
          data: { session: null, preview: null, progress: null, events: [] }
        })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    const conflictError = {
      response: {
        status: 409,
        data: {
          code: 'SESSION_FILE_CONFLICT',
          currentSessionId: 301,
          currentRevision: 1
        }
      }
    }
    vi.mocked(api.post)
      .mockRejectedValueOnce(conflictError)
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce({ data: buildWorkspace({ revision: 2 }) })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    await screen.findByText('Escolher arquivo')
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    await waitFor(() => expect(fileInput).toBeEnabled())
    const replacementFile = new File(['new'], 'mesma-fatura.csv', { type: 'text/csv' })

    await user.upload(fileInput, replacementFile)
    await user.click(screen.getByRole('button', { name: 'Analisar fatura' }))
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(fileInput).toHaveValue(''))
    expect(screen.getByRole('button', { name: 'Analisar fatura' })).toBeDisabled()

    await user.upload(fileInput, replacementFile)
    const analyzeButton = screen.getByRole('button', { name: 'Analisar fatura' })
    await waitFor(() => expect(analyzeButton).toBeEnabled())
    await user.click(analyzeButton)

    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3))
    expect(vi.mocked(api.post).mock.calls[2]?.[1]).toMatchObject({
      replace: true,
      expectedSessionId: 301,
      expectedRevision: 1,
      fileName: 'mesma-fatura.csv'
    })
  })

  it('confirma a contraparte visual selecionada como checkpoint persistido', async () => {
    const confirmedWorkspace = buildWorkspace({
      revision: 2,
      resolutions: { 'bank-pending': 'CONFIRMED_EXISTING' },
      transactionIds: { 'bank-pending': [504] }
    })
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: openWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url.endsWith('/sessions/301/items/bank-pending/decision')) {
        return Promise.resolve({ data: confirmedWorkspace })
      }
      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    await screen.findByText('Mercado no arquivo')
    const pendingCard = screen.getByText('Pendente no arquivo').closest('section') as HTMLElement
    const counterpartOption = within(pendingCard).getByRole('option', {
      name: /Sem correspondencia no Zenit/
    })
    await user.selectOptions(
      counterpartOption.parentElement as HTMLSelectElement,
      'transaction:504'
    )
    await user.click(
      within(pendingCard).getByRole('button', {
        name: 'Confirmar correspondencia existente'
      })
    )

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/financial/credit-cards/1/reconciliation/sessions/301/items/bank-pending/decision',
        {
          expectedRevision: 1,
          decision: 'CONFIRM_EXISTING',
          transactionIds: [504]
        }
      )
    })
    expect(await screen.findByText('Existente confirmado')).toBeInTheDocument()
    expect(within(pendingCard).getByText('OK')).toBeInTheDocument()
    expect(within(pendingCard).queryByText('Pendente')).not.toBeInTheDocument()
    expect(
      within(pendingCard).queryByText('Lancamento existente confirmado nesta conciliacao.')
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pendentes (0)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Pendentes (0)' }))
    expect(screen.queryByText('Pendente no arquivo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'OK (1)' }))
    const confirmedCard = screen.getByText('Pendente no arquivo').closest('section') as HTMLElement
    expect(within(confirmedCard).getByText('OK')).toBeInTheDocument()
    expect(within(confirmedCard).getByText('Existente confirmado')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Todos (6)' }))
    await user.click(screen.getByRole('button', { name: 'Visualização lado a lado' }))
    const fileRegion = screen.getByRole('region', { name: 'Itens do arquivo da fatura' })
    const zenitRegion = screen.getByRole('region', { name: 'Lançamentos da fatura no Zenit' })
    expect(within(getFileItem(fileRegion, 'bank-pending')).getByText('OK')).toBeInTheDocument()
    await user.click(
      getFileSelectionButton(fileRegion, 'bank-pending', /Pendente no arquivo/)
    )
    expect(
      screen.getByText('Lancamento existente confirmado nesta conciliacao.')
    ).toBeInTheDocument()
    await user.click(getFileSelectionButton(fileRegion, 'bank-market', /Mercado no arquivo/))
    expect(within(getZenitItem(zenitRegion, 'transaction:504')).getByRole('button')).toBeDisabled()
    expect(within(getZenitItem(zenitRegion, 'transaction:501')).getByRole('button')).toBeEnabled()
  })

  it('remove a confirmacao existente nos dois modos sem sugerir exclusao financeira', async () => {
    const autoMatchPreview = {
      ...preview,
      items: preview.items.map((item) =>
        item.id === 'bank-pending'
          ? {
              ...item,
              status: 'OK',
              reason: 'EXACT',
              matchedTransactions: [
                matchedTransaction(504, 'Sem correspondencia no Zenit', '25.00')
              ]
            }
          : item
      )
    }
    const suppressedPreview = {
      ...autoMatchPreview,
      items: autoMatchPreview.items.map((item) =>
        item.id === 'bank-pending'
          ? { ...item, status: 'PENDING', operationalMatchState: 'SUPPRESSED' }
          : item
      )
    }
    const confirmedWorkspace = buildWorkspace({
      sourcePreview: autoMatchPreview,
      revision: 2,
      resolutions: { 'bank-pending': 'CONFIRMED_EXISTING' },
      transactionIds: { 'bank-pending': [504] },
      resolutionData: { 'bank-pending': { mode: 'AUTO_EXACT' } }
    })
    const unconfirmedWorkspace = buildWorkspace({
      sourcePreview: suppressedPreview,
      revision: 3,
      resolutionData: {
        'bank-pending': {
          mode: 'AUTO_MATCH_SUPPRESSED',
          suppressedResolution: 'CONFIRMED_EXISTING',
          transactionId: 504,
          transactionIds: [504]
        }
      }
    })
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    let resolveDecision!: (value: { data: typeof unconfirmedWorkspace }) => void
    const decisionRequest = new Promise<{ data: typeof unconfirmedWorkspace }>((resolve) => {
      resolveDecision = resolve
    })

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: confirmedWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url.endsWith('/sessions/301/items/bank-pending/decision')) {
        return decisionRequest
      }
      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    const confirmedCard = (await screen.findByText('Pendente no arquivo')).closest(
      'section'
    ) as HTMLElement
    expect(
      within(confirmedCard).getByRole('button', { name: 'Remover vínculo' })
    ).toBeEnabled()
    expect(within(confirmedCard).getByText('Relacionado automaticamente')).toBeInTheDocument()
    expect(within(confirmedCard).getByText('1 correspondência encontrada')).toBeInTheDocument()
    expect(
      within(confirmedCard).getByText(
        /Remove apenas a confirmação desta conciliação; o lançamento financeiro não será alterado\./
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Visualização lado a lado' }))
    const fileRegion = screen.getByRole('region', { name: 'Itens do arquivo da fatura' })
    await user.click(getFileSelectionButton(fileRegion, 'bank-pending', /Pendente no arquivo/))
    expect(
      screen.getByText('Lançamento relacionado automaticamente nesta conciliação.')
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        /Remove apenas a confirmação desta conciliação; o lançamento financeiro não será alterado\./
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remover vínculo' }))

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringMatching(/lançamento financeiro existente não será alterado/i)
    )
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/financial/credit-cards/1/reconciliation/sessions/301/items/bank-pending/decision',
        { expectedRevision: 2, decision: 'UNCONFIRM_EXISTING' }
      )
    })
    expect(screen.getByRole('button', { name: 'Removendo vínculo...' })).toBeDisabled()

    await act(async () => {
      resolveDecision({ data: unconfirmedWorkspace })
      await decisionRequest
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Remover vínculo' })).not.toBeInTheDocument()
    })
    expect(
      screen.getByRole('status')
    ).toHaveTextContent(
      'Possível correspondência destacada. Vínculo automático removido. Selecione a contraparte para confirmar manualmente.'
    )

    await user.click(screen.getByRole('button', { name: 'Visualização detalhada' }))
    const pendingCard = screen.getByText('Pendente no arquivo').closest('section') as HTMLElement
    expect(within(pendingCard).getByText('1 sugestão de correspondência')).toBeInTheDocument()
    expect(
      within(pendingCard).getByText(
        'Vínculo automático removido. Selecione a contraparte para confirmar manualmente.'
      )
    ).toBeInTheDocument()
    expect(within(pendingCard).queryByText('Lancamento ja encontrado.')).not.toBeInTheDocument()
    expect(addToastMock).toHaveBeenCalledWith(
      'Vínculo removido da conciliação. O lançamento financeiro não foi alterado.',
      'success'
    )
  })

  it('remove o vinculo com fixa apenas da conciliacao nos dois modos', async () => {
    const suppressedFixedPreview = {
      ...preview,
      items: preview.items.map((item) =>
        item.id === 'bank-fixed' ? { ...item, status: 'PENDING' } : item
      )
    }
    const linkedWorkspace = buildWorkspace({
      revision: 4,
      resolutions: { 'bank-fixed': 'LINKED_FIXED' }
    })
    const unlinkedWorkspace = buildWorkspace({
      sourcePreview: suppressedFixedPreview,
      revision: 5,
      resolutionData: {
        'bank-fixed': {
          mode: 'AUTO_MATCH_SUPPRESSED',
          suppressedResolution: 'LINKED_FIXED',
          fixedTemplateId: 77,
          occurrenceKey: '77:2026-09'
        }
      }
    })
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    let resolveDecision!: (value: { data: typeof unlinkedWorkspace }) => void
    const decisionRequest = new Promise<{ data: typeof unlinkedWorkspace }>((resolve) => {
      resolveDecision = resolve
    })

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: linkedWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url.endsWith('/sessions/301/items/bank-fixed/decision')) {
        return decisionRequest
      }
      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    const linkedCard = (await screen.findByText('Netflix no arquivo')).closest(
      'section'
    ) as HTMLElement
    expect(
      within(linkedCard).getByRole('button', { name: 'Remover vínculo' })
    ).toBeEnabled()
    expect(
      within(linkedCard).getByText(
        /Remove o vínculo somente desta conciliação; a regra recorrente será mantida para os próximos meses\./
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Visualização lado a lado' }))
    const fileRegion = screen.getByRole('region', { name: 'Itens do arquivo da fatura' })
    await user.click(getFileSelectionButton(fileRegion, 'bank-fixed', /Netflix no arquivo/))
    expect(
      screen.getByText(
        /Remove o vínculo somente desta conciliação; a regra recorrente será mantida para os próximos meses\./
      )
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remover vínculo' }))

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringMatching(/regra recorrente será mantida para os próximos meses/i)
    )
    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/financial/credit-cards/1/reconciliation/sessions/301/items/bank-fixed/decision',
        { expectedRevision: 4, decision: 'UNLINK_FIXED' }
      )
    })
    expect(screen.getByRole('button', { name: 'Removendo vínculo...' })).toBeDisabled()

    await act(async () => {
      resolveDecision({ data: unlinkedWorkspace })
      await decisionRequest
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Remover vínculo' })
      ).not.toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Visualização detalhada' }))
    const unlinkedCard = screen.getByText('Netflix no arquivo').closest('section') as HTMLElement
    expect(within(unlinkedCard).getByText('1 sugestão de correspondência')).toBeInTheDocument()
    expect(within(unlinkedCard).getByRole('button', { name: 'Vincular a fixa' })).toBeEnabled()
    expect(addToastMock).toHaveBeenCalledWith(
      'Vínculo removido desta conciliação. A regra recorrente foi mantida para os próximos meses.',
      'success'
    )
  })

  it('explica os estados operacionais que impedem uma confirmacao direta', async () => {
    const operationalStates = [
      {
        state: 'CLAIMED',
        message: 'Este lançamento já foi usado em outro item da conciliação.'
      },
      {
        state: 'OUT_OF_SCOPE',
        message:
          'A correspondência indicada não pertence ou não está disponível na fatura-alvo.'
      },
      {
        state: 'IDENTITY_CHANGED',
        message: 'Os dados do lançamento mudaram durante a análise. Revise a correspondência.'
      },
      {
        state: 'REVERSE_AMBIGUOUS',
        message:
          'A mesma contraparte pode corresponder a mais de um item. Revise antes de confirmar.'
      }
    ] as const
    const operationalPreview = {
      ...preview,
      items: preview.items.map((item, index) => ({
        ...item,
        operationalMatchState: operationalStates[index]?.state
      }))
    }
    const operationalWorkspace = buildWorkspace({ sourcePreview: operationalPreview })

    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: operationalWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    render(<CreditCardReconciliationPage />)
    await screen.findByText('Mercado no arquivo')

    operationalStates.forEach(({ message }) => {
      expect(screen.getByText(message)).toBeInTheDocument()
    })
  })

  it('projeta similares e pendentes ja confirmados no filtro OK ao retomar a sessao', async () => {
    const resumedWorkspace = buildWorkspace({
      revision: 3,
      resolutions: {
        'bank-market': 'CONFIRMED_EXISTING',
        'bank-pending': 'CONFIRMED_EXISTING'
      },
      transactionIds: {
        'bank-market': [501],
        'bank-pending': [504]
      }
    })
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: resumedWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)

    const similarCard = (await screen.findByText('Mercado no arquivo')).closest(
      'section'
    ) as HTMLElement
    const pendingConfirmedCard = screen.getByText('Pendente no arquivo').closest(
      'section'
    ) as HTMLElement
    expect(within(similarCard).getByText('OK')).toBeInTheDocument()
    expect(within(similarCard).queryByText('Similar')).not.toBeInTheDocument()
    expect(within(pendingConfirmedCard).getByText('OK')).toBeInTheDocument()
    expect(within(pendingConfirmedCard).queryByText('Pendente')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'OK (2)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Similares (4)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pendentes (0)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Similares (4)' }))
    expect(screen.queryByText('Mercado no arquivo')).not.toBeInTheDocument()
    expect(screen.queryByText('Pendente no arquivo')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'OK (2)' }))
    expect(screen.getByText('Mercado no arquivo')).toBeInTheDocument()
    expect(screen.getByText('Pendente no arquivo')).toBeInTheDocument()
  })

  it('ignora e restaura item sem recoloca-lo na selecao de importacao', async () => {
    const ignoredWorkspace = buildWorkspace({
      revision: 2,
      resolutions: { 'bank-pending': 'IGNORED' }
    })
    const restoredWorkspace = buildWorkspace({ revision: 3 })
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: openWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockImplementation((_url: string, body?: any) => {
      return Promise.resolve({
        data: body?.decision === 'IGNORE' ? ignoredWorkspace : restoredWorkspace
      })
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    const pendingCard = (await screen.findByText('Pendente no arquivo')).closest('section') as HTMLElement
    await user.click(within(pendingCard).getByRole('button', { name: 'Ignorar' }))

    await screen.findByText('Ignorado')
    const pendingCheckbox = within(pendingCard).getByRole('checkbox')
    expect(pendingCheckbox).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Marcar tudo' }))
    expect(pendingCheckbox).not.toBeChecked()
    await user.click(within(pendingCard).getByRole('button', { name: 'Voltar a conferir' }))

    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith(
        '/financial/credit-cards/1/reconciliation/sessions/301/items/bank-pending/decision',
        { expectedRevision: 2, decision: 'RESTORE' }
      )
    })
  })

  it('conclui, reabre e reinicia mantendo claro o que nao sera desfeito', async () => {
    const allResolved = Object.fromEntries(
      previewItems.map((item) => [item.id, 'IGNORED' as const])
    )
    const readyWorkspace = buildWorkspace({ resolutions: allResolved })
    const completedWorkspace = buildWorkspace({
      resolutions: allResolved,
      revision: 2,
      status: 'COMPLETED'
    })
    const reopenedWorkspace = buildWorkspace({ resolutions: allResolved, revision: 3 })
    const confirmMock = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmMock)
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: readyWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })
    vi.mocked(api.post).mockImplementation((url: string, body?: any) => {
      if (url.endsWith('/status')) {
        return Promise.resolve({
          data: body.status === 'COMPLETED' ? completedWorkspace : reopenedWorkspace
        })
      }
      if (url.endsWith('/reset')) {
        return Promise.resolve({ data: { reset: true, referenceYear: 2026, referenceMonth: 9 } })
      }
      return Promise.reject(new Error(`Unexpected POST request: ${url}`))
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    await screen.findByText('Mercado no arquivo')
    await user.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(await screen.findByText('Concluida')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reabrir' }))
    expect(await screen.findByText('Em andamento')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reiniciar' }))

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringMatching(/lancamentos financeiros.*vinculos a transacoes fixas/i)
    )
    await waitFor(() => {
      expect(api.post).toHaveBeenLastCalledWith(
        '/financial/credit-cards/1/reconciliation/sessions/301/reset',
        { expectedRevision: 3, confirmed: true }
      )
    })
    expect(screen.queryByText('Mercado no arquivo')).not.toBeInTheDocument()
    expect(await screen.findByText('Escolher arquivo')).toBeInTheDocument()
  })

  it('trata nao importavel como informativo terminal sem oferecer decisao de ignorar', async () => {
    const informationalPreview = {
      ...preview,
      summary: {
        ...preview.summary,
        pendingCount: 0,
        notImportableCount: 1,
        importableCount: preview.summary.importableCount - 1
      },
      items: preview.items.map((item) =>
        item.id === 'bank-pending'
          ? {
              ...item,
              status: 'NOT_IMPORTABLE',
              reason: 'NON_IMPORTABLE',
              canImport: false,
              nonImportableReason: 'Linha informativa do arquivo'
            }
          : item
      )
    }
    const informationalWorkspace = buildWorkspace({ sourcePreview: informationalPreview })
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') return Promise.resolve({ data: [invoice] })
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url === '/financial/credit-cards/1/reconciliation/sessions/2026/9') {
        return Promise.resolve({ data: informationalWorkspace })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    const user = userEvent.setup()
    render(<CreditCardReconciliationPage />)
    const informationalCard = (await screen.findByText('Pendente no arquivo')).closest(
      'section'
    ) as HTMLElement

    expect(within(informationalCard).getByText('Nao importavel')).toBeInTheDocument()
    expect(within(informationalCard).getByRole('checkbox')).toBeDisabled()
    expect(within(informationalCard).queryByRole('button', { name: 'Ignorar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nao importaveis (1)' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Marcar tudo' }))
    expect(within(informationalCard).getByRole('checkbox')).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Importar 5 selecionado(s)' })).toBeEnabled()
  })

  it('lista vencidas pela data e exclui referencias pagas do seletor', async () => {
    const secondOverdueInvoice = {
      ...previousInvoice,
      id: 103,
      referenceMonth: 7,
      dueDate: '2026-07-17T12:00:00.000Z',
      status: 'CLOSED'
    }
    const paidInvoice = {
      ...previousInvoice,
      id: 104,
      referenceMonth: 6,
      dueDate: '2026-06-17T12:00:00.000Z',
      status: 'PAID'
    }
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards') return Promise.resolve({ data: [card] })
      if (url === '/financial/credit-cards/1/invoices') {
        return Promise.resolve({
          data: [invoice, previousInvoice, secondOverdueInvoice, paidInvoice]
        })
      }
      if (url === '/financial/categories') return Promise.resolve({ data: [category] })
      if (url === '/financial/credit-card-invoices/101') {
        return Promise.resolve({ data: targetInvoiceDetail })
      }
      if (url.startsWith('/financial/credit-cards/1/reconciliation/sessions/')) {
        return Promise.resolve({ data: { session: null, preview: null, progress: null, events: [] } })
      }
      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    render(<CreditCardReconciliationPage />)
    await screen.findByText('Escolher arquivo')
    expect(await screen.findByRole('option', { name: /08\/2026.*Vencida/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /07\/2026.*Vencida/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /06\/2026/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Paga/ })).not.toBeInTheDocument()
  })
})
