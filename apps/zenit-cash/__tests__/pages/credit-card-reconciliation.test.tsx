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

      return Promise.reject(new Error(`Unexpected GET request: ${url}`))
    })

    vi.mocked(api.post).mockImplementation((url: string) => {
      if (url === '/financial/credit-cards/1/reconciliation/preview') {
        return Promise.resolve({ data: preview })
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

    let resolvePreview: ((value: { data: typeof preview }) => void) | undefined
    let previewRequestBody: Record<string, unknown> | undefined
    vi.mocked(api.post).mockImplementation((url: string, body?: unknown) => {
      if (url === '/financial/credit-cards/1/reconciliation/preview') {
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
      resolvePreview?.({ data: preview })
    })
    await screen.findByText('Mercado no arquivo')
    await waitFor(() => expect(fileInput).toBeEnabled())
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

    expect(within(zenitRegion).queryAllByRole('button')).toHaveLength(0)
    expect(marketImportCheckbox).not.toBeChecked()
    expect(pendingImportCheckbox).toBeChecked()

    await user.click(marketButton)

    expect(marketButton).toHaveAttribute('aria-pressed', 'true')
    expect(marketZenitItem).toHaveAttribute('data-reconciliation-highlighted', 'true')
    await waitFor(() => expect(scrollIntoViewMock).toHaveBeenCalled())
    expect(scrollIntoViewMock.mock.contexts).toContain(marketZenitItem)
    expect(marketImportCheckbox).not.toBeChecked()
    expect(pendingImportCheckbox).toBeChecked()

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
    expect(pendingImportCheckbox).toBeChecked()
    expect(api.post).toHaveBeenCalledTimes(1)
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

  it.each(['CREATED', 'SKIPPED_DUPLICATE'] as const)(
    'atualiza as faturas e preserva a fatura alvo apos commit unitario %s',
    async (resultStatus) => {
      const invoiceListResponses = [
        [invoice, previousInvoice],
        [invoice, previousInvoice]
      ]
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/financial/credit-cards') {
          return Promise.resolve({ data: [card] })
        }

        if (url === '/financial/credit-cards/1/invoices') {
          return Promise.resolve({
            data: invoiceListResponses.shift() || [invoice, previousInvoice]
          })
        }

        if (url === '/financial/categories') {
          return Promise.resolve({ data: [category] })
        }

        if (url === '/financial/credit-card-invoices/101') {
          return Promise.resolve({ data: targetInvoiceDetail })
        }

        if (url === '/financial/credit-card-invoices/102') {
          return Promise.resolve({ data: previousTargetInvoiceDetail })
        }

        return Promise.reject(new Error(`Unexpected GET request: ${url}`))
      })

      const previousPreview = {
        ...preview,
        statement: {
          ...preview.statement,
          dueDate: previousInvoice.dueDate,
          referenceMonth: previousInvoice.referenceMonth
        }
      }
      vi.mocked(api.post).mockImplementation((url: string) => {
        if (url === '/financial/credit-cards/1/reconciliation/preview') {
          return Promise.resolve({ data: previousPreview })
        }

        if (url === '/financial/credit-cards/1/reconciliation/commit') {
          const created = resultStatus === 'CREATED'
          return Promise.resolve({
            data: {
              summary: {
                selectedCount: 1,
                createdCount: created ? 1 : 0,
                linkedFixedCount: 0,
                skippedDuplicateCount: created ? 0 : 1,
                skippedNotImportableCount: 0,
                failedCount: 0
              },
              results: [
                {
                  itemId: 'bank-pending',
                  status: resultStatus,
                  message: created ? 'Lancamento criado' : 'Duplicidade encontrada',
                  createdTransactionIds: created ? [901] : []
                }
              ]
            }
          })
        }

        return Promise.reject(new Error(`Unexpected POST request: ${url}`))
      })

      const user = await renderAnalyzedPage({ targetInvoiceKey: '2026-08' })
      const targetInvoiceSelect = screen.getByRole('option', {
        name: /08\/2026/
      }).parentElement as HTMLSelectElement
      const pendingDescription = screen.getByText('Pendente no arquivo')
      const pendingCard = pendingDescription.closest('section')
      expect(pendingCard).toBeTruthy()

      await user.click(
        within(pendingCard as HTMLElement).getByRole('button', { name: 'Importar este item' })
      )

      await waitFor(() => {
        expect(
          vi.mocked(api.get).mock.calls.filter(
            ([url]) => url === '/financial/credit-cards/1/invoices'
          )
        ).toHaveLength(2)
      })
      await waitFor(() => expect(targetInvoiceSelect).toHaveValue('2026-08'))

      const commitCall = vi.mocked(api.post).mock.calls.find(
        ([url]) => url === '/financial/credit-cards/1/reconciliation/commit'
      )
      expect(commitCall?.[1]).toMatchObject({
        targetReferenceYear: 2026,
        targetReferenceMonth: 8,
        selectedItems: [expect.objectContaining({ itemId: 'bank-pending' })]
      })
    }
  )
})
