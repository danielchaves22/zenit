import {
  AccountType,
  CreditCardInvoiceStatus,
  Prisma,
  PrismaClient,
  TransactionStatus,
  TransactionType
} from '@prisma/client';
import FinancialTransactionService from './financial-transaction.service';
import FixedTransactionService, { buildOccurrenceKeyValue } from './fixed-transaction.service';
import CreditCardReconciliationCategorySuggestionService, {
  type CreditCardReconciliationCategorySuggestion
} from './credit-card-reconciliation-category-suggestion.service';
import { parseDecimal } from '../utils/money';
import {
  buildCreditCardInvoiceReferenceForMonth,
  resolveCreditCardInvoiceReference,
  resolveCreditCardInvoiceStatus
} from '../utils/credit-card';

const prisma = new PrismaClient();
const pdfParse: (dataBuffer: Buffer) => Promise<{ text: string }> = require('pdf-parse');
const CAIXA_BANK_CODE = 'CAIXA_ECONOMICA_FEDERAL';
const BRADESCO_BANK_CODE = 'BRADESCO';
const NUBANK_BANK_CODE = 'NUBANK';

export type CreditCardReconciliationSourceType = 'CAIXA_PDF' | 'BRADESCO_CSV' | 'NUBANK_CSV';
export type CreditCardReconciliationItemStatus =
  | 'OK'
  | 'SIMILAR'
  | 'PENDING'
  | 'NOT_IMPORTABLE';
export type CreditCardReconciliationItemKind =
  | 'PURCHASE'
  | 'INSTALLMENT'
  | 'ANNUITY'
  | 'INTEREST'
  | 'FEE'
  | 'TAX'
  | 'PAYMENT'
  | 'BALANCE'
  | 'CREDIT'
  | 'ADJUSTMENT'
  | 'OTHER';

type StatementDirection = 'DEBIT' | 'CREDIT';
type StatementDatePrecision = 'PURCHASE_DATE' | 'STATEMENT_REFERENCE';

type ParsedStatementItem = {
  id: string;
  sequence: number;
  kind: CreditCardReconciliationItemKind;
  direction: StatementDirection;
  amount: string;
  signedAmount: string;
  purchaseDate: Date | null;
  createDate: Date;
  datePrecision: StatementDatePrecision;
  installmentNumber: number | null;
  totalInstallments: number | null;
  sourceDescription: string;
  sourceSection: string;
  cardSuffix: string | null;
  canImport: boolean;
  nonImportableReason: string | null;
  rawLine: string;
};

type ParsedStatement = {
  sourceType: CreditCardReconciliationSourceType;
  fileName: string | null;
  dueDate: Date;
  totalAmount: string;
  parsedNetAmount: string;
  referenceYear: number;
  referenceMonth: number;
  items: ParsedStatementItem[];
};

type ExistingTransactionCandidate = {
  matchKey: string;
  matchSource: 'TRANSACTION' | 'PROJECTED_FIXED';
  id: number | null;
  fixedTemplateId: number | null;
  occurrenceKey: string | null;
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  installmentNumber: number | null;
  totalInstallments: number | null;
  status: TransactionStatus;
  purchaseGroupId: string | null;
  importSourceType?: CreditCardReconciliationSourceType | null;
  importSourceDescription?: string | null;
  creditCardInvoice: {
    id: number;
    referenceYear: number;
    referenceMonth: number;
    status: CreditCardInvoiceStatus;
    dueDate?: Date | null;
  } | null;
};

type MatchReason =
  | 'EXACT'
  | 'AMBIGUOUS_EXACT'
  | 'INVOICE_DIVERGENCE'
  | 'DATE_DIVERGENCE'
  | 'INSTALLMENT_DIVERGENCE'
  | 'NON_IMPORTABLE'
  | 'NO_MATCH';

type MatchClassification = {
  status: CreditCardReconciliationItemStatus;
  reason: MatchReason;
  matchedTransactions: ExistingTransactionCandidate[];
};

export type ReconciliationPreviewItem = {
  id: string;
  sequence: number;
  status: CreditCardReconciliationItemStatus;
  reason: MatchReason;
  kind: CreditCardReconciliationItemKind;
  direction: StatementDirection;
  amount: string;
  signedAmount: string;
  purchaseDate: string | null;
  datePrecision: StatementDatePrecision;
  installmentNumber: number | null;
  totalInstallments: number | null;
  sourceDescription: string;
  sourceSection: string;
  cardSuffix: string | null;
  canImport: boolean;
  nonImportableReason: string | null;
  categorySuggestion: CreditCardReconciliationCategorySuggestion;
  matchedTransactions: Array<{
    matchKey: string;
    matchSource: 'TRANSACTION' | 'PROJECTED_FIXED';
    id: number | null;
    fixedTemplateId: number | null;
    occurrenceKey: string | null;
    description: string;
    amount: string;
    date: string;
    status: TransactionStatus;
    installmentNumber: number | null;
    totalInstallments: number | null;
    purchaseGroupId: string | null;
    invoiceReference: string | null;
    invoiceStatus: CreditCardInvoiceStatus | null;
  }>;
};

export type ReconciliationPreviewResult = {
  statement: {
    sourceType: CreditCardReconciliationSourceType;
    fileName: string | null;
    dueDate: string;
    totalAmount: string;
    parsedNetAmount: string;
    referenceYear: number;
    referenceMonth: number;
  };
  summary: {
    totalItems: number;
    okCount: number;
    similarCount: number;
    pendingCount: number;
    notImportableCount: number;
    importableCount: number;
    importableAmount: string;
    okAmount: string;
    similarAmount: string;
    pendingAmount: string;
    notImportableAmount: string;
  };
  items: ReconciliationPreviewItem[];
};

export type ReconciliationCommitResult = {
  statement: ReconciliationPreviewResult['statement'];
  summary: {
    selectedCount: number;
    createdCount: number;
    skippedDuplicateCount: number;
    skippedNotImportableCount: number;
    failedCount: number;
  };
  results: Array<{
    itemId: string;
    status: 'CREATED' | 'SKIPPED_DUPLICATE' | 'SKIPPED_NOT_IMPORTABLE' | 'FAILED';
    message: string;
    createdTransactionIds: number[];
  }>;
};

function normalizePdfText(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\u00a0/g, ' ');
}

function normalizeInlineWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeComparableText(value: string | null | undefined) {
  return normalizeInlineWhitespace(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function isSameCalendarDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function differenceInDays(left: Date, right: Date) {
  const leftValue = new Date(left.getFullYear(), left.getMonth(), left.getDate()).getTime();
  const rightValue = new Date(right.getFullYear(), right.getMonth(), right.getDate()).getTime();
  return Math.round((leftValue - rightValue) / (1000 * 60 * 60 * 24));
}

function formatReference(referenceYear: number, referenceMonth: number) {
  return `${String(referenceMonth).padStart(2, '0')}/${referenceYear}`;
}

function formatIsoDate(value: Date | null) {
  return value ? value.toISOString() : null;
}

function buildDateWindow(items: ParsedStatementItem[]) {
  const explicitDates = items.map((item) => item.purchaseDate || item.createDate);

  const minDate = explicitDates.length > 0
    ? new Date(Math.min(...explicitDates.map((value) => value.getTime())))
    : new Date();
  const maxDate = explicitDates.length > 0
    ? new Date(Math.max(...explicitDates.map((value) => value.getTime())))
    : new Date();

  minDate.setDate(minDate.getDate() - 31);
  maxDate.setDate(maxDate.getDate() + 31);

  return { minDate, maxDate };
}

function isCandidateInStatementReference(
  candidate: ExistingTransactionCandidate,
  referenceYear: number,
  referenceMonth: number
) {
  return (
    candidate.creditCardInvoice?.referenceYear === referenceYear &&
    candidate.creditCardInvoice?.referenceMonth === referenceMonth
  );
}

function hasCandidateInvoiceDivergence(
  candidate: ExistingTransactionCandidate,
  referenceYear: number,
  referenceMonth: number
) {
  return Boolean(candidate.creditCardInvoice) &&
    !isCandidateInStatementReference(candidate, referenceYear, referenceMonth);
}

function normalizeInstallmentSignature(installmentNumber: number | null, totalInstallments: number | null) {
  return {
    installmentNumber: installmentNumber ?? 1,
    totalInstallments: totalInstallments ?? 1
  };
}

function filterCandidatesBySourceDescription(
  candidates: ExistingTransactionCandidate[],
  sourceDescription: string
) {
  const normalizedSourceDescription = normalizeComparableText(sourceDescription);
  if (!normalizedSourceDescription) {
    return [];
  }

  return candidates.filter((candidate) => {
    const normalizedCandidateDescription = normalizeComparableText(
      candidate.importSourceDescription
    );

    return Boolean(normalizedCandidateDescription) &&
      normalizedCandidateDescription === normalizedSourceDescription;
  });
}

function buildImportNote(sourceType: CreditCardReconciliationSourceType, item: ParsedStatementItem) {
  const parts = [
    `Importado por conciliacao de cartao (${sourceType})`,
    `item ${item.id}`
  ];

  if (item.cardSuffix) {
    parts.push(`cartao final ${item.cardSuffix}`);
  }

  parts.push(`descricao original: ${item.sourceDescription}`);

  return parts.join(' - ');
}

function parseDdMmYyyy(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    throw new Error('Data da fatura invalida');
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function parseYyyyMmDd(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('Data do CSV invalida');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function parseStatementDateFromFileName(fileName: string | null) {
  if (!fileName) {
    return null;
  }

  const match = fileName.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return null;
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
}

function splitCsvLine(line: string) {
  const fields: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (insideQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (character === ',' && !insideQuotes) {
      fields.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  fields.push(current);
  return fields.map((field) => field.trim());
}

function inferPurchaseDate(dayMonth: string, statementDueDate: Date) {
  const match = dayMonth.match(/^(\d{2})\/(\d{2})$/);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = statementDueDate.getFullYear();
  let candidate = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (candidate.getTime() > statementDueDate.getTime()) {
    year -= 1;
    candidate = new Date(year, month - 1, day, 12, 0, 0, 0);
  }

  return candidate;
}

function buildReferenceMonthDate(referenceYear: number, referenceMonth: number, monthOffset = 0) {
  return new Date(referenceYear, referenceMonth - 1 + monthOffset, 1, 12, 0, 0, 0);
}

function decodeBase64File(base64Value: string) {
  const normalized = base64Value.includes(',')
    ? base64Value.slice(base64Value.indexOf(',') + 1)
    : base64Value;

  return Buffer.from(normalized, 'base64');
}

function isHeaderLine(value: string) {
  return (
    value === 'Demonstrativo' ||
    value.startsWith('Data Descrição') ||
    value.startsWith('DataDescrição') ||
    value.startsWith('Crédito/Débito') ||
    value.startsWith('CotaçãoValor Original') ||
    value.startsWith('Central de Atendimento') ||
    value.startsWith('Informações Complementares') ||
    value.startsWith('Informacoes Complementares') ||
    value === 'null'
  );
}

function isSectionTotalLine(value: string) {
  return (
    value.startsWith('Total COMPRAS') ||
    value.startsWith('Total OUTROS') ||
    value.startsWith('Total final') ||
    value.startsWith('Valor total desta fatura')
  );
}

function isNormalizedHeaderLine(value: string) {
  const normalized = normalizeComparableText(value);

  return (
    normalized === 'DEMONSTRATIVO' ||
    normalized.startsWith('DATA DESCRICAO') ||
    normalized.startsWith('DATADESCRICAO') ||
    normalized.startsWith('CREDITO/DEBITO') ||
    normalized.startsWith('COTACAO VALOR ORIGINAL') ||
    normalized.startsWith('COTACAOVALOR ORIGINAL') ||
    normalized.startsWith('CENTRAL DE ATENDIMENTO') ||
    normalized.startsWith('INFORMACOES COMPLEMENTARES') ||
    normalized === 'NULL'
  );
}

function isNormalizedSectionTotalLine(value: string) {
  const normalized = normalizeComparableText(value);

  return (
    normalized.startsWith('TOTAL COMPRAS') ||
    normalized.startsWith('TOTAL OUTROS') ||
    normalized.startsWith('TOTAL FINAL') ||
    normalized.startsWith('VALOR TOTAL DESTA FATURA')
  );
}

function classifyItemKind(
  section: string,
  description: string,
  direction: StatementDirection,
  hasInstallmentSignature = false
): CreditCardReconciliationItemKind {
  const normalizedDescription = normalizeComparableText(description);

  if (direction === 'CREDIT') {
    if (
      normalizedDescription.includes('PAGAMENTO') ||
      normalizedDescription.includes('PAGTO') ||
      normalizedDescription.includes('DEB EM C/C')
    ) {
      return 'PAYMENT';
    }

    if (normalizedDescription.includes('AJUSTE') || normalizedDescription.includes('CRED')) {
      return 'ADJUSTMENT';
    }

    return 'CREDIT';
  }

  if (
    normalizedDescription.startsWith('TOTAL DA FATURA ANTERIOR') ||
    normalizedDescription.startsWith('SALDO ANTERIOR')
  ) {
    return 'BALANCE';
  }

  if (section === 'ANNUITY' || normalizedDescription.includes('ANUIDADE')) {
    return 'ANNUITY';
  }

  if (normalizedDescription.includes('IOF')) {
    return 'TAX';
  }

  if (
    normalizedDescription.includes('JUROS') ||
    normalizedDescription.includes('ENCARGO')
  ) {
    return 'INTEREST';
  }

  if (normalizedDescription.includes('MULTA') || normalizedDescription.includes('MORA')) {
    return 'FEE';
  }

  if (section === 'INSTALLMENTS' || hasInstallmentSignature) {
    return 'INSTALLMENT';
  }

  if (section === 'PURCHASES' || section === 'STATEMENT') {
    return 'PURCHASE';
  }

  if (section === 'OTHER') {
    return 'OTHER';
  }

  return 'OTHER';
}

function resolveImportability(
  kind: CreditCardReconciliationItemKind,
  direction: StatementDirection
) {
  if (direction === 'CREDIT') {
    return {
      canImport: false,
      nonImportableReason: 'Credito ou ajuste nao suportado pela conciliacao v1'
    };
  }

  if (kind === 'BALANCE') {
    return {
      canImport: false,
      nonImportableReason: 'Saldo de fatura anterior e apenas informativo'
    };
  }

  if (kind === 'PAYMENT') {
    return {
      canImport: false,
      nonImportableReason: 'Pagamento de fatura nao e importado por esta rotina'
    };
  }

  return {
    canImport: true,
    nonImportableReason: null
  };
}

function resolveImportabilityWithAmount(
  kind: CreditCardReconciliationItemKind,
  direction: StatementDirection,
  amount: string
) {
  if (parseDecimal(amount).lte(0)) {
    return {
      canImport: false,
      nonImportableReason: 'Lancamento com valor zero nao pode ser importado'
    };
  }

  return resolveImportability(kind, direction);
}

function parseCaixaStatementLine(params: {
  line: string;
  sequence: number;
  statementDueDate: Date;
  statementReferenceYear: number;
  statementReferenceMonth: number;
  section: string;
  cardSuffix: string | null;
}): ParsedStatementItem | null {
  const {
    line,
    sequence,
    statementDueDate,
    statementReferenceYear,
    statementReferenceMonth,
    section,
    cardSuffix
  } = params;

  const datedMatch = line.match(/^(\d{2}\/\d{2})(.+?)(\d{1,3}(?:\.\d{3})*,\d{2})([DC])$/);

  if (datedMatch) {
    const dayMonth = datedMatch[1];
    const payload = normalizeInlineWhitespace(datedMatch[2]);
    const amount = parseDecimal(datedMatch[3]).toString();
    const direction: StatementDirection = datedMatch[4] === 'C' ? 'CREDIT' : 'DEBIT';
    const installmentMatch = payload.match(/^(.*?)(\d{2})\s+DE\s+(\d{2})(.*)$/);
    const sourceDescription = installmentMatch
      ? normalizeInlineWhitespace(`${installmentMatch[1]} ${installmentMatch[4]}`.trim())
      : payload;
    const installmentNumber = installmentMatch ? Number(installmentMatch[2]) : null;
    const totalInstallments = installmentMatch ? Number(installmentMatch[3]) : null;
    const kind = classifyItemKind(
      section,
      sourceDescription,
      direction,
      Boolean(installmentMatch)
    );
    const { canImport, nonImportableReason } = resolveImportabilityWithAmount(
      kind,
      direction,
      amount
    );
    const purchaseDate = inferPurchaseDate(dayMonth, statementDueDate);
    const signedAmount = direction === 'CREDIT' ? `-${amount}` : amount;

    return {
      id: `item-${String(sequence).padStart(4, '0')}`,
      sequence,
      kind,
      direction,
      amount,
      signedAmount,
      purchaseDate,
      createDate: purchaseDate || statementDueDate,
      datePrecision: 'PURCHASE_DATE',
      installmentNumber,
      totalInstallments,
      sourceDescription,
      sourceSection: section,
      cardSuffix,
      canImport,
      nonImportableReason,
      rawLine: line
    };
  }

  if (section === 'ANNUITY') {
    const annuityInstallmentMatch = line.match(
      /^(.+?)(\d{2})\/\s*(\d{2})(\d{1,3}(?:\.\d{3})*,\d{2})([DC])$/
    );

    if (annuityInstallmentMatch) {
      const sourceDescription = normalizeInlineWhitespace(annuityInstallmentMatch[1]);
      const installmentNumber = Number(annuityInstallmentMatch[2]);
      const totalInstallments = Number(annuityInstallmentMatch[3]);
      const amount = parseDecimal(annuityInstallmentMatch[4]).toString();
      const direction: StatementDirection =
        annuityInstallmentMatch[5] === 'C' ? 'CREDIT' : 'DEBIT';
      const kind = classifyItemKind(
        section,
        sourceDescription,
        direction,
        true
      );
      const { canImport, nonImportableReason } = resolveImportabilityWithAmount(
        kind,
        direction,
        amount
      );
      const signedAmount = direction === 'CREDIT' ? `-${amount}` : amount;
      const createDate =
        installmentNumber > 1
          ? buildReferenceMonthDate(
              statementReferenceYear,
              statementReferenceMonth,
              -(installmentNumber - 1)
            )
          : buildReferenceMonthDate(statementReferenceYear, statementReferenceMonth);

      return {
        id: `item-${String(sequence).padStart(4, '0')}`,
        sequence,
        kind,
        direction,
        amount,
        signedAmount,
        purchaseDate: null,
        createDate,
        datePrecision: 'STATEMENT_REFERENCE',
        installmentNumber,
        totalInstallments,
        sourceDescription,
        sourceSection: section,
        cardSuffix,
        canImport,
        nonImportableReason,
        rawLine: line
      };
    }

    const annuityMatch = line.match(/^(.+?)(\d{1,3}(?:\.\d{3})*,\d{2})([DC])$/);
    if (!annuityMatch) {
      return null;
    }

    const payload = normalizeInlineWhitespace(annuityMatch[1]);
    const direction: StatementDirection = annuityMatch[3] === 'C' ? 'CREDIT' : 'DEBIT';
    const parcelMatch = payload.match(/^(.*?)(\d{2})\/\s*(\d{2})$/);
    const sourceDescription = parcelMatch
      ? normalizeInlineWhitespace(parcelMatch[1])
      : payload;
    const installmentNumber = parcelMatch ? Number(parcelMatch[2]) : null;
    const totalInstallments = parcelMatch ? Number(parcelMatch[3]) : null;
    const amount = parseDecimal(annuityMatch[2]).toString();
    const kind = classifyItemKind(
      section,
      sourceDescription,
      direction,
      Boolean(parcelMatch)
    );
    const { canImport, nonImportableReason } = resolveImportabilityWithAmount(
      kind,
      direction,
      amount
    );
    const signedAmount = direction === 'CREDIT' ? `-${amount}` : amount;
    const createDate =
      installmentNumber && installmentNumber > 1
        ? buildReferenceMonthDate(
            statementReferenceYear,
            statementReferenceMonth,
            -(installmentNumber - 1)
          )
        : buildReferenceMonthDate(statementReferenceYear, statementReferenceMonth);

    return {
      id: `item-${String(sequence).padStart(4, '0')}`,
      sequence,
      kind,
      direction,
      amount,
      signedAmount,
      purchaseDate: null,
      createDate,
      datePrecision: 'STATEMENT_REFERENCE',
      installmentNumber,
      totalInstallments,
      sourceDescription,
      sourceSection: section,
      cardSuffix,
      canImport,
      nonImportableReason,
      rawLine: line
    };
  }

  return null;
}

function parseCaixaStatementText(text: string, fileName: string | null): ParsedStatement {
  const normalizedText = normalizePdfText(text);
  const dueDateMatch = normalizedText.match(/VENCIMENTO\s+(\d{2}\/\d{2}\/\d{4})/i);
  const totalAmountMatch =
    normalizedText.match(/VALOR TOTAL DESTA FATURA\s+R\$\s*([\d.,]+)/i) ||
    normalizedText.match(/Valor total desta fatura R\$\s*([\d.,]+)/i);

  if (!dueDateMatch || !totalAmountMatch) {
    throw new Error('Nao foi possivel identificar vencimento e total da fatura da Caixa');
  }

  const dueDate = parseDdMmYyyy(dueDateMatch[1]);
  const totalAmount = parseDecimal(totalAmountMatch[1]).toString();
  const referenceYear = dueDate.getFullYear();
  const referenceMonth = dueDate.getMonth() + 1;
  const lines = normalizedText
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstDemonstrativoIndex = lines.findIndex(
    (line) => normalizeComparableText(line) === 'DEMONSTRATIVO'
  );

  if (firstDemonstrativoIndex === -1) {
    throw new Error('Nao foi possivel localizar o demonstrativo da fatura da Caixa');
  }

  const items: ParsedStatementItem[] = [];
  let currentSection = 'STATEMENT';
  let currentCardSuffix: string | null = null;
  let sequence = 0;

  for (const line of lines.slice(firstDemonstrativoIndex + 1)) {
    const normalizedLine = normalizeComparableText(line);

    if (isNormalizedHeaderLine(line)) {
      continue;
    }

    if (
      normalizedLine.startsWith('LEGENDA') ||
      normalizedLine.startsWith('OPERACAO CONTRATADA')
    ) {
      break;
    }

    const normalizedCardHolderMatch = normalizedLine.match(/^(.+?) \(CARTAO (\d{4})\)$/);
    if (
      normalizedCardHolderMatch &&
      !normalizedLine.startsWith('COMPRAS ') &&
      !normalizedLine.startsWith('COMPRAS PARCELADAS ') &&
      !normalizedLine.startsWith('OUTROS ')
    ) {
      currentCardSuffix = normalizedCardHolderMatch[2];
      continue;
    }

    const normalizedPurchaseSectionMatch = normalizedLine.match(/^COMPRAS \(CARTAO (\d{4})\)$/);
    if (normalizedPurchaseSectionMatch) {
      currentSection = 'PURCHASES';
      currentCardSuffix = normalizedPurchaseSectionMatch[1];
      continue;
    }

    const normalizedInstallmentSectionMatch = normalizedLine.match(
      /^COMPRAS PARCELADAS \(CARTAO (\d{4})\)$/
    );
    if (normalizedInstallmentSectionMatch) {
      currentSection = 'INSTALLMENTS';
      currentCardSuffix = normalizedInstallmentSectionMatch[1];
      continue;
    }

    const normalizedOtherSectionMatch = normalizedLine.match(/^OUTROS \(CARTAO (\d{4})\)$/);
    if (normalizedOtherSectionMatch) {
      currentSection = 'OTHER';
      currentCardSuffix = normalizedOtherSectionMatch[1];
      continue;
    }

    if (normalizedLine === 'ANUIDADE') {
      currentSection = 'ANNUITY';
      continue;
    }

    if (isNormalizedSectionTotalLine(line)) {
      continue;
    }

    if (line.startsWith('Legenda') || line.startsWith('Operação Contratada') || line.startsWith('Operacao Contratada')) {
      break;
    }

    const cardHolderMatch = line.match(/^(.+?) \(Cartão (\d{4})\)$/);
    if (cardHolderMatch) {
      currentCardSuffix = cardHolderMatch[2];
      continue;
    }

    const purchaseSectionMatch = line.match(/^COMPRAS \(Cartão (\d{4})\)$/);
    if (purchaseSectionMatch) {
      currentSection = 'PURCHASES';
      currentCardSuffix = purchaseSectionMatch[1];
      continue;
    }

    const installmentSectionMatch = line.match(/^COMPRAS PARCELADAS \(Cartão (\d{4})\)$/);
    if (installmentSectionMatch) {
      currentSection = 'INSTALLMENTS';
      currentCardSuffix = installmentSectionMatch[1];
      continue;
    }

    const otherSectionMatch = line.match(/^OUTROS \(Cartão (\d{4})\)$/);
    if (otherSectionMatch) {
      currentSection = 'OTHER';
      currentCardSuffix = otherSectionMatch[1];
      continue;
    }

    if (line === 'ANUIDADE') {
      currentSection = 'ANNUITY';
      continue;
    }

    if (isSectionTotalLine(line)) {
      continue;
    }

    sequence += 1;
    const parsedLine = parseCaixaStatementLine({
      line,
      sequence,
      statementDueDate: dueDate,
      statementReferenceYear: referenceYear,
      statementReferenceMonth: referenceMonth,
      section: currentSection,
      cardSuffix: currentCardSuffix
    });

    if (!parsedLine) {
      continue;
    }

    items.push(parsedLine);
  }

  const parsedNetAmount = items.reduce(
    (sum, item) => sum.plus(parseDecimal(item.signedAmount)),
    new Prisma.Decimal(0)
  );

  return {
    sourceType: 'CAIXA_PDF',
    fileName,
    dueDate,
    totalAmount,
    parsedNetAmount: parsedNetAmount.toString(),
    referenceYear,
    referenceMonth,
    items
  };
}

function isBradescoHeaderLine(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/\s+/g, '');

  return (
    normalized.startsWith('data;hist') &&
    normalized.includes('valor(us$);valor(r$)')
  );
}

function getStatementSourceSection(kind: CreditCardReconciliationItemKind) {
  if (kind === 'PURCHASE') {
    return 'PURCHASES';
  }

  if (kind === 'INSTALLMENT') {
    return 'INSTALLMENTS';
  }

  if (kind === 'ANNUITY') {
    return 'ANNUITY';
  }

  return 'OTHER';
}

function parseBradescoStatementLine(params: {
  line: string;
  sequence: number;
  statementDate: Date;
  cardSuffix: string | null;
}): ParsedStatementItem | null {
  const fields = params.line.split(';').map((field) => field.trim());
  if (fields.length < 4) {
    return null;
  }

  const dateValue = fields[0];
  const rawDescription = normalizeInlineWhitespace(fields[1]);
  const amountField = normalizeInlineWhitespace(fields[3]);

  if (!dateValue || !rawDescription || !amountField) {
    return null;
  }

  const dateMatch = dateValue.match(/^(\d{2})\/(\d{2})$/);
  if (!dateMatch) {
    return null;
  }

  const purchaseDate = inferPurchaseDate(dateValue, params.statementDate);
  const signedAmountDecimal = parseDecimal(amountField);
  const direction: StatementDirection = signedAmountDecimal.lt(0) ? 'CREDIT' : 'DEBIT';
  const amount = parseDecimal(amountField.replace('-', '')).toString();
  const installmentMatch = rawDescription.match(/^(.*\S)\s+(\d{1,3})\/(\d{1,3})$/);
  const sourceDescription = installmentMatch
    ? normalizeInlineWhitespace(installmentMatch[1])
    : rawDescription;
  const installmentNumber = installmentMatch ? Number(installmentMatch[2]) : null;
  const totalInstallments = installmentMatch ? Number(installmentMatch[3]) : null;
  const kind = classifyItemKind(
    'STATEMENT',
    sourceDescription,
    direction,
    Boolean(installmentMatch)
  );
  const { canImport, nonImportableReason } = resolveImportabilityWithAmount(
    kind,
    direction,
    amount
  );
  const signedAmount = direction === 'CREDIT' ? `-${amount}` : amount;

  return {
    id: `item-${String(params.sequence).padStart(4, '0')}`,
    sequence: params.sequence,
    kind,
    direction,
    amount,
    signedAmount,
    purchaseDate,
    createDate: purchaseDate || params.statementDate,
    datePrecision: 'PURCHASE_DATE',
    installmentNumber,
    totalInstallments,
    sourceDescription,
    sourceSection: getStatementSourceSection(kind),
    cardSuffix: params.cardSuffix,
    canImport,
    nonImportableReason,
    rawLine: params.line
  };
}

function parseBradescoStatementText(text: string, fileName: string | null): ParsedStatement {
  const normalizedText = text.replace(/\uFEFF/g, '');
  const statementDateMatch = normalizedText.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/i);
  const totalAmountMatch = normalizedText.match(/Total da fatura em Real:\s*;;;?\s*([-\d.,]+)/i);

  if (!statementDateMatch || !totalAmountMatch) {
    throw new Error('Nao foi possivel identificar data e total da fatura do Bradesco');
  }

  const statementDate = parseDdMmYyyy(statementDateMatch[1]);
  const totalAmount = parseDecimal(totalAmountMatch[1]).toString();
  const referenceYear = statementDate.getFullYear();
  const referenceMonth = statementDate.getMonth() + 1;
  const lines = normalizedText
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);

  const items: ParsedStatementItem[] = [];
  let currentCardSuffix: string | null = null;
  let sequence = 0;
  let insideTransactions = false;

  for (const line of lines) {
    if (/^Data:\s*\d{2}\/\d{2}\/\d{4}/i.test(line)) {
      continue;
    }

    if (/^Situa[cç][aã]o da Fatura:/i.test(line)) {
      continue;
    }

    if (
      /^Total da fatura em Real:/i.test(line) ||
      /^Resumo das Despesas/i.test(line) ||
      /^Taxas;/i.test(line) ||
      /^Taxas$/i.test(line)
    ) {
      break;
    }

    const cardMatch = line.match(/^.+?;;;\s*(\d{4})$/);
    if (cardMatch) {
      currentCardSuffix = cardMatch[1];
      insideTransactions = false;
      continue;
    }

    if (isBradescoHeaderLine(line)) {
      insideTransactions = true;
      continue;
    }

    if (!currentCardSuffix || !insideTransactions) {
      continue;
    }

    sequence += 1;
    const parsedLine = parseBradescoStatementLine({
      line,
      sequence,
      statementDate,
      cardSuffix: currentCardSuffix
    });

    if (!parsedLine) {
      sequence -= 1;
      continue;
    }

    items.push(parsedLine);
  }

  const parsedNetAmount = items.reduce(
    (sum, item) => sum.plus(parseDecimal(item.signedAmount)),
    new Prisma.Decimal(0)
  );

  return {
    sourceType: 'BRADESCO_CSV',
    fileName,
    dueDate: statementDate,
    totalAmount,
    parsedNetAmount: parsedNetAmount.toString(),
    referenceYear,
    referenceMonth,
    items
  };
}

function parseNubankStatementLine(params: {
  line: string;
  sequence: number;
}): ParsedStatementItem | null {
  const fields = splitCsvLine(params.line);
  if (fields.length < 3) {
    return null;
  }

  const purchaseDateValue = fields[0];
  const rawDescription = normalizeInlineWhitespace(fields[1]);
  const amountField = normalizeInlineWhitespace(fields[2]);

  if (!purchaseDateValue || !rawDescription || !amountField) {
    return null;
  }

  const purchaseDate = parseYyyyMmDd(purchaseDateValue);
  const signedAmountDecimal = parseDecimal(amountField);
  const direction: StatementDirection = signedAmountDecimal.lt(0) ? 'CREDIT' : 'DEBIT';
  const amount = parseDecimal(amountField.replace('-', '')).toString();
  const installmentMatch = rawDescription.match(
    /^(.*?)(?:\s*-\s*)?parcela\s+(\d{1,3})\/(\d{1,3})$/i
  );
  const sourceDescription = installmentMatch
    ? normalizeInlineWhitespace(installmentMatch[1])
    : rawDescription;
  const installmentNumber = installmentMatch ? Number(installmentMatch[2]) : null;
  const totalInstallments = installmentMatch ? Number(installmentMatch[3]) : null;
  const kind = classifyItemKind(
    'STATEMENT',
    sourceDescription,
    direction,
    Boolean(installmentMatch)
  );
  const { canImport, nonImportableReason } = resolveImportabilityWithAmount(
    kind,
    direction,
    amount
  );
  const signedAmount = direction === 'CREDIT' ? `-${amount}` : amount;

  return {
    id: `item-${String(params.sequence).padStart(4, '0')}`,
    sequence: params.sequence,
    kind,
    direction,
    amount,
    signedAmount,
    purchaseDate,
    createDate: purchaseDate,
    datePrecision: 'PURCHASE_DATE',
    installmentNumber,
    totalInstallments,
    sourceDescription,
    sourceSection: getStatementSourceSection(kind),
    cardSuffix: null,
    canImport,
    nonImportableReason,
    rawLine: params.line
  };
}

function parseNubankStatementText(text: string, fileName: string | null): ParsedStatement {
  const normalizedText = text.replace(/\uFEFF/g, '');
  const lines = normalizedText
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV do Nubank vazio ou incompleto');
  }

  const header = splitCsvLine(lines[0]).map((field) => normalizeComparableText(field));
  if (header[0] !== 'DATE' || header[1] !== 'TITLE' || header[2] !== 'AMOUNT') {
    throw new Error('Cabecalho do CSV do Nubank nao reconhecido');
  }

  const items: ParsedStatementItem[] = [];
  let sequence = 0;

  for (const line of lines.slice(1)) {
    sequence += 1;
    const parsedLine = parseNubankStatementLine({
      line,
      sequence
    });

    if (!parsedLine) {
      sequence -= 1;
      continue;
    }

    items.push(parsedLine);
  }

  if (items.length === 0) {
    throw new Error('Nenhum lancamento valido foi encontrado no CSV do Nubank');
  }

  const parsedNetAmount = items.reduce(
    (sum, item) => sum.plus(parseDecimal(item.signedAmount)),
    new Prisma.Decimal(0)
  );
  const statementDate =
    parseStatementDateFromFileName(fileName) ||
    items.reduce(
      (latest, item) =>
        item.purchaseDate && item.purchaseDate.getTime() > latest.getTime()
          ? item.purchaseDate
          : latest,
      items[0].purchaseDate || items[0].createDate
    );

  return {
    sourceType: 'NUBANK_CSV',
    fileName,
    dueDate: statementDate,
    totalAmount: parsedNetAmount.toString(),
    parsedNetAmount: parsedNetAmount.toString(),
    referenceYear: statementDate.getFullYear(),
    referenceMonth: statementDate.getMonth() + 1,
    items
  };
}

function toPreviewMatchTransaction(candidate: ExistingTransactionCandidate) {
  return {
    matchKey: candidate.matchKey,
    matchSource: candidate.matchSource,
    id: candidate.id,
    fixedTemplateId: candidate.fixedTemplateId,
    occurrenceKey: candidate.occurrenceKey,
    description: candidate.description,
    amount: candidate.amount.toString(),
    date: candidate.date.toISOString(),
    status: candidate.status,
    installmentNumber: candidate.installmentNumber,
    totalInstallments: candidate.totalInstallments,
    purchaseGroupId: candidate.purchaseGroupId,
    invoiceReference: candidate.creditCardInvoice
      ? formatReference(
          candidate.creditCardInvoice.referenceYear,
          candidate.creditCardInvoice.referenceMonth
        )
      : null,
    invoiceStatus: candidate.creditCardInvoice?.status || null
  };
}

function classifyMatches(
  item: ParsedStatementItem,
  candidates: ExistingTransactionCandidate[],
  referenceYear: number,
  referenceMonth: number
): MatchClassification {
  if (!item.canImport) {
    return {
      status: 'NOT_IMPORTABLE',
      reason: 'NON_IMPORTABLE',
      matchedTransactions: []
    };
  }

  const amount = parseDecimal(item.amount);
  const importInstallments = normalizeInstallmentSignature(
    item.installmentNumber,
    item.totalInstallments
  );

  const exactMatches = candidates.filter((candidate) => {
    if (!parseDecimal(candidate.amount).equals(amount)) {
      return false;
    }

    const candidateInstallments = normalizeInstallmentSignature(
      candidate.installmentNumber,
      candidate.totalInstallments
    );

    if (
      candidateInstallments.installmentNumber !== importInstallments.installmentNumber ||
      candidateInstallments.totalInstallments !== importInstallments.totalInstallments
    ) {
      return false;
    }

    if (item.datePrecision === 'PURCHASE_DATE' && item.purchaseDate) {
      return (
        isSameCalendarDate(candidate.date, item.purchaseDate) &&
        !hasCandidateInvoiceDivergence(candidate, referenceYear, referenceMonth)
      );
    }

    return isCandidateInStatementReference(candidate, referenceYear, referenceMonth);
  });

  const exactMatchesWithSourceDescription = filterCandidatesBySourceDescription(
    exactMatches,
    item.sourceDescription
  );

  if (exactMatchesWithSourceDescription.length === 1) {
    return {
      status: 'OK',
      reason: 'EXACT',
      matchedTransactions: exactMatchesWithSourceDescription
    };
  }

  if (exactMatches.length === 1) {
    return {
      status: 'OK',
      reason: 'EXACT',
      matchedTransactions: exactMatches
    };
  }

  if (exactMatchesWithSourceDescription.length > 1) {
    return {
      status: 'SIMILAR',
      reason: 'AMBIGUOUS_EXACT',
      matchedTransactions: exactMatchesWithSourceDescription
    };
  }

  if (exactMatches.length > 1) {
    return {
      status: 'SIMILAR',
      reason: 'AMBIGUOUS_EXACT',
      matchedTransactions: exactMatches
    };
  }

  const partialMatches = candidates.filter((candidate) => {
    if (!parseDecimal(candidate.amount).equals(amount)) {
      return false;
    }

    const candidateInstallments = normalizeInstallmentSignature(
      candidate.installmentNumber,
      candidate.totalInstallments
    );
    const sameInstallmentSignature =
      candidateInstallments.installmentNumber === importInstallments.installmentNumber &&
      candidateInstallments.totalInstallments === importInstallments.totalInstallments;
    const sameStatementReference = isCandidateInStatementReference(
      candidate,
      referenceYear,
      referenceMonth
    );

    if (item.datePrecision === 'PURCHASE_DATE' && item.purchaseDate) {
      const purchaseDate = item.purchaseDate;
      const sameDate = isSameCalendarDate(candidate.date, purchaseDate);

      if (
        sameInstallmentSignature &&
        sameDate &&
        hasCandidateInvoiceDivergence(candidate, referenceYear, referenceMonth)
      ) {
        return true;
      }

      if (sameInstallmentSignature && !sameDate) {
        if (Math.abs(differenceInDays(candidate.date, purchaseDate)) <= 15) {
          return true;
        }

        return candidate.matchSource === 'PROJECTED_FIXED' && sameStatementReference;
      }

      if (!sameInstallmentSignature && sameDate) {
        return true;
      }

      return false;
    }

    if (
      sameInstallmentSignature &&
      hasCandidateInvoiceDivergence(candidate, referenceYear, referenceMonth)
    ) {
      return true;
    }

    return sameStatementReference && !sameInstallmentSignature;
  });

  if (partialMatches.length > 0) {
    const purchaseDate = item.purchaseDate;
    const hasInvoiceDivergence = partialMatches.some((candidate) => {
      const candidateInstallments = normalizeInstallmentSignature(
        candidate.installmentNumber,
        candidate.totalInstallments
      );

      return (
        candidateInstallments.installmentNumber === importInstallments.installmentNumber &&
        candidateInstallments.totalInstallments === importInstallments.totalInstallments &&
        hasCandidateInvoiceDivergence(candidate, referenceYear, referenceMonth)
      );
    });
    const reason =
      hasInvoiceDivergence
        ? 'INVOICE_DIVERGENCE'
        : item.datePrecision === 'PURCHASE_DATE' && purchaseDate
          ? partialMatches.some((candidate) => isSameCalendarDate(candidate.date, purchaseDate))
            ? 'INSTALLMENT_DIVERGENCE'
            : 'DATE_DIVERGENCE'
          : 'INSTALLMENT_DIVERGENCE';

    return {
      status: 'SIMILAR',
      reason,
      matchedTransactions: partialMatches
    };
  }

  return {
    status: 'PENDING',
    reason: 'NO_MATCH',
    matchedTransactions: []
  };
}

async function loadCandidateTransactions(params: {
  accountId: number;
  companyId: number;
  items: ParsedStatementItem[];
}) {
  const { minDate, maxDate } = buildDateWindow(params.items);
  const [materializedTransactions, projectedFixedCandidates] = await Promise.all([
    prisma.financialTransaction.findMany({
      where: {
        companyId: params.companyId,
        fromAccountId: params.accountId,
        type: TransactionType.EXPENSE,
        status: {
          not: TransactionStatus.CANCELED
        },
        date: {
          gte: minDate,
          lte: maxDate
        }
      },
      select: {
        id: true,
        description: true,
        amount: true,
        date: true,
        installmentNumber: true,
        totalInstallments: true,
        status: true,
        purchaseGroupId: true,
        importSourceType: true,
        importSourceDescription: true,
        creditCardInvoice: {
          select: {
            id: true,
            referenceYear: true,
            referenceMonth: true,
            status: true,
            dueDate: true
          }
        }
      },
      orderBy: [
        { date: 'desc' },
        { id: 'desc' }
      ]
    }),
    loadProjectedFixedCandidates({
      accountId: params.accountId,
      companyId: params.companyId,
      minDate,
      maxDate
    })
  ]);

  return [
    ...materializedTransactions.map((candidate) => ({
      ...candidate,
      matchKey: `transaction:${candidate.id}`,
      matchSource: 'TRANSACTION' as const,
      fixedTemplateId: null,
      occurrenceKey: null
    })),
    ...projectedFixedCandidates
  ] as ExistingTransactionCandidate[];
}

async function loadProjectedFixedCandidates(params: {
  accountId: number;
  companyId: number;
  minDate: Date;
  maxDate: Date;
}) {
  const rangeStart = new Date(
    params.minDate.getFullYear(),
    params.minDate.getMonth(),
    1,
    12,
    0,
    0,
    0
  );
  const rangeEnd = new Date(
    params.maxDate.getFullYear(),
    params.maxDate.getMonth() + 1,
    0,
    12,
    0,
    0,
    0
  );

  const templates = await FixedTransactionService.getTemplatesForProjection({
    companyId: params.companyId,
    rangeStart,
    rangeEnd,
    accessibleAccountIds: [params.accountId]
  });

  const startCursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1, 12, 0, 0, 0);
  const endCursor = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1, 12, 0, 0, 0);
  const projectedCandidates: Array<{
    templateId: number;
    description: string;
    amount: Prisma.Decimal;
    occurrenceDate: Date;
    occurrenceKey: string;
    referenceYear: number;
    referenceMonth: number;
    dueDate: Date | null;
    invoiceStatus: CreditCardInvoiceStatus | null;
  }> = [];

  for (const template of templates) {
    if (!FixedTransactionService.isCreditCardFixedExpenseTemplate(template)) {
      continue;
    }

    if (template.fromAccountId !== params.accountId) {
      continue;
    }

    let cursor = new Date(startCursor);

    while (cursor <= endCursor) {
      const occurrenceDate = FixedTransactionService.buildVirtualDateForMonth(
        template,
        cursor.getFullYear(),
        cursor.getMonth()
      );

      if (template.startDate <= occurrenceDate && (!template.endDate || template.endDate >= occurrenceDate)) {
        const occurrenceKey = buildOccurrenceKeyValue(template.id, occurrenceDate);
        const invoiceReference =
          template.fromAccount?.statementClosingDay && template.fromAccount?.statementDueDay
            ? resolveCreditCardInvoiceReference(
                occurrenceDate,
                template.fromAccount.statementClosingDay,
                template.fromAccount.statementDueDay
              )
            : null;

        projectedCandidates.push({
          templateId: template.id,
          description: template.description,
          amount: new Prisma.Decimal(template.amount.toString()),
          occurrenceDate,
          occurrenceKey,
          referenceYear: invoiceReference?.referenceYear || occurrenceDate.getFullYear(),
          referenceMonth: invoiceReference?.referenceMonth || occurrenceDate.getMonth() + 1,
          dueDate: invoiceReference?.dueDate || null,
          invoiceStatus: invoiceReference
            ? resolveCreditCardInvoiceStatus(invoiceReference.closingDate, false)
            : null
        });
      }

      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12, 0, 0, 0);
    }
  }

  if (projectedCandidates.length === 0) {
    return [] as ExistingTransactionCandidate[];
  }

  const existingOccurrences = await prisma.financialTransaction.findMany({
    where: {
      companyId: params.companyId,
      occurrenceKey: {
        in: projectedCandidates.map((candidate) => candidate.occurrenceKey)
      }
    },
    select: {
      occurrenceKey: true
    }
  });
  const existingOccurrenceKeys = new Set(
    existingOccurrences
      .map((transaction) => transaction.occurrenceKey)
      .filter((occurrenceKey): occurrenceKey is string => Boolean(occurrenceKey))
  );

  return projectedCandidates
    .filter((candidate) => !existingOccurrenceKeys.has(candidate.occurrenceKey))
    .map((candidate) => ({
      matchKey: `projected-fixed:${candidate.templateId}:${candidate.occurrenceKey}`,
      matchSource: 'PROJECTED_FIXED' as const,
      id: null,
      fixedTemplateId: candidate.templateId,
      occurrenceKey: candidate.occurrenceKey,
      description: candidate.description,
      amount: candidate.amount,
      date: candidate.occurrenceDate,
      installmentNumber: null,
      totalInstallments: null,
      status: TransactionStatus.PENDING,
      purchaseGroupId: null,
      importSourceDescription: null,
      creditCardInvoice: {
        id: 0,
        referenceYear: candidate.referenceYear,
        referenceMonth: candidate.referenceMonth,
        status: candidate.invoiceStatus || CreditCardInvoiceStatus.OPEN,
        dueDate: candidate.dueDate
      }
    }));
}

async function ensureCreditCardAccount(accountId: number, companyId: number) {
  const account = await prisma.financialAccount.findFirst({
    where: {
      id: accountId,
      companyId,
      type: AccountType.CREDIT_CARD
    },
    select: {
      id: true,
      name: true,
      type: true,
      statementClosingDay: true,
      statementDueDay: true,
      bankName: true,
      bankCode: true,
      bank: {
        select: {
          code: true,
          name: true
        }
      }
    }
  });

  if (!account) {
    throw new Error('Cartao de credito nao encontrado');
  }

  const normalizedBankCode = normalizeComparableText(account.bank?.code || account.bankCode);
  const normalizedBankName = normalizeComparableText(account.bank?.name || account.bankName);

  if (
    (
      normalizedBankCode !== CAIXA_BANK_CODE &&
      !normalizedBankName.includes('CAIXA ECONOMICA FEDERAL')
    ) &&
    (
      normalizedBankCode !== BRADESCO_BANK_CODE &&
      !normalizedBankName.includes('BRADESCO')
    ) &&
    (
      normalizedBankCode !== NUBANK_BANK_CODE &&
      !normalizedBankName.includes('NUBANK')
    )
  ) {
    throw new Error(
      'Conciliacao de fatura disponivel apenas para cartoes Caixa, Bradesco e Nubank neste momento'
    );
  }

  return {
    ...account,
    reconciliationSourceType:
      normalizedBankCode === BRADESCO_BANK_CODE || normalizedBankName.includes('BRADESCO')
        ? 'BRADESCO_CSV'
        : normalizedBankCode === NUBANK_BANK_CODE || normalizedBankName.includes('NUBANK')
          ? 'NUBANK_CSV'
          : 'CAIXA_PDF'
  } as typeof account & {
    reconciliationSourceType: CreditCardReconciliationSourceType;
  };
}

function buildImportedStatementInvoiceReference(
  statement: ParsedStatement,
  account: {
    id: number;
    statementClosingDay: number | null;
    statementDueDay: number | null;
  }
) {
  if (!account.statementClosingDay || !account.statementDueDay) {
    throw new Error('Cartao de credito sem fechamento e vencimento configurados');
  }

  return {
    ...buildCreditCardInvoiceReferenceForMonth(
      statement.referenceYear,
      statement.referenceMonth,
      account.statementClosingDay,
      account.statementDueDay
    ),
    accountId: account.id
  };
}

function buildPreviewItems(
  statement: ParsedStatement,
  candidates: ExistingTransactionCandidate[],
  categorySuggestions: Map<string, CreditCardReconciliationCategorySuggestion>
): ReconciliationPreviewItem[] {
  return statement.items.map((item) => {
    const classification = classifyMatches(
      item,
      candidates,
      statement.referenceYear,
      statement.referenceMonth
    );

    return {
      id: item.id,
      sequence: item.sequence,
      status: classification.status,
      reason: classification.reason,
      kind: item.kind,
      direction: item.direction,
      amount: item.amount,
      signedAmount: item.signedAmount,
      purchaseDate: formatIsoDate(item.purchaseDate),
      datePrecision: item.datePrecision,
      installmentNumber: item.installmentNumber,
      totalInstallments: item.totalInstallments,
      sourceDescription: item.sourceDescription,
      sourceSection: item.sourceSection,
      cardSuffix: item.cardSuffix,
      canImport: item.canImport,
      nonImportableReason: item.nonImportableReason,
      categorySuggestion: categorySuggestions.get(item.id) || {
        categoryId: null,
        categoryName: null,
        categoryColor: null,
        categoryIcon: null,
        source: null,
        reason: null
      },
      matchedTransactions: classification.matchedTransactions.map(toPreviewMatchTransaction)
    };
  });
}

function buildPreviewSummary(items: ReconciliationPreviewItem[]) {
  const okItems = items.filter((item) => item.status === 'OK');
  const similarItems = items.filter((item) => item.status === 'SIMILAR');
  const pendingItems = items.filter((item) => item.status === 'PENDING');
  const notImportableItems = items.filter((item) => item.status === 'NOT_IMPORTABLE');
  const importableItems = items.filter((item) => item.canImport);

  const sumItems = (entries: ReconciliationPreviewItem[]) =>
    entries.reduce((sum, entry) => sum.plus(parseDecimal(entry.signedAmount)), new Prisma.Decimal(0)).toString();

  return {
    totalItems: items.length,
    okCount: okItems.length,
    similarCount: similarItems.length,
    pendingCount: pendingItems.length,
    notImportableCount: notImportableItems.length,
    importableCount: importableItems.length,
    importableAmount: sumItems(importableItems),
    okAmount: sumItems(okItems),
    similarAmount: sumItems(similarItems),
    pendingAmount: sumItems(pendingItems),
    notImportableAmount: sumItems(notImportableItems)
  };
}

async function parseStatementFromSource(params: {
  sourceType: CreditCardReconciliationSourceType;
  fileBase64: string;
  fileName?: string | null;
}) {
  if (params.sourceType === 'CAIXA_PDF') {
    const buffer = decodeBase64File(params.fileBase64);
    const pdfResult = await pdfParse(buffer);
    return parseCaixaStatementText(pdfResult.text, params.fileName ?? null);
  }

  if (params.sourceType === 'BRADESCO_CSV') {
    const buffer = decodeBase64File(params.fileBase64);
    return parseBradescoStatementText(buffer.toString('latin1'), params.fileName ?? null);
  }

  if (params.sourceType === 'NUBANK_CSV') {
    const buffer = decodeBase64File(params.fileBase64);
    return parseNubankStatementText(buffer.toString('utf8'), params.fileName ?? null);
  }

  throw new Error('Fonte de conciliacao nao suportada');
}

function normalizeCreatedTransactions(
  transaction: Awaited<ReturnType<typeof FinancialTransactionService.createTransaction>>
) {
  return Array.isArray(transaction) ? transaction : [transaction];
}

export default class CreditCardStatementReconciliationService {
  static async buildPreview(params: {
    accountId: number;
    companyId: number;
    sourceType: CreditCardReconciliationSourceType;
    fileBase64: string;
    fileName?: string | null;
  }): Promise<ReconciliationPreviewResult> {
    const account = await ensureCreditCardAccount(params.accountId, params.companyId);

    if (params.sourceType !== account.reconciliationSourceType) {
      throw new Error('Fonte de conciliacao incompativel com o banco do cartao');
    }

    const statement = await parseStatementFromSource({
      sourceType: params.sourceType,
      fileBase64: params.fileBase64,
      fileName: params.fileName
    });
    const [candidates, categorySuggestions] = await Promise.all([
      loadCandidateTransactions({
        accountId: params.accountId,
        companyId: params.companyId,
        items: statement.items
      }),
      CreditCardReconciliationCategorySuggestionService.suggestForItems({
        companyId: params.companyId,
        accountId: params.accountId,
        items: statement.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          amount: item.amount,
          installmentNumber: item.installmentNumber,
          totalInstallments: item.totalInstallments,
          sourceDescription: item.sourceDescription,
          sourceSection: item.sourceSection,
          canImport: item.canImport
        }))
      })
    ]);
    const items = buildPreviewItems(statement, candidates, categorySuggestions);

    return {
      statement: {
        sourceType: statement.sourceType,
        fileName: statement.fileName,
        dueDate: statement.dueDate.toISOString(),
        totalAmount: statement.totalAmount,
        parsedNetAmount: statement.parsedNetAmount,
        referenceYear: statement.referenceYear,
        referenceMonth: statement.referenceMonth
      },
      summary: buildPreviewSummary(items),
      items
    };
  }

  static async commit(params: {
    accountId: number;
    companyId: number;
    userId: number;
    sourceType: CreditCardReconciliationSourceType;
    fileBase64: string;
    fileName?: string | null;
    selectedItems: Array<{
      itemId: string;
      description: string;
      categoryId: number;
    }>;
  }): Promise<ReconciliationCommitResult> {
    const account = await ensureCreditCardAccount(params.accountId, params.companyId);

    if (params.sourceType !== account.reconciliationSourceType) {
      throw new Error('Fonte de conciliacao incompativel com o banco do cartao');
    }

    const statement = await parseStatementFromSource({
      sourceType: params.sourceType,
      fileBase64: params.fileBase64,
      fileName: params.fileName
    });
    const selectedItemsInput = Array.from(
      new Map(params.selectedItems.map((item) => [item.itemId, item])).values()
    );
    const selectedItemIds = selectedItemsInput.map((item) => item.itemId);
    const selectedItems = statement.items.filter((item) => selectedItemIds.includes(item.id));
    const importedStatementInvoiceReference = buildImportedStatementInvoiceReference(
      statement,
      account
    );
    const results: ReconciliationCommitResult['results'] = [];
    let candidates = await loadCandidateTransactions({
      accountId: params.accountId,
      companyId: params.companyId,
      items: statement.items
    });

    for (const itemId of selectedItemIds) {
      const item = selectedItems.find((entry) => entry.id === itemId);
      const selectedInput = selectedItemsInput.find((entry) => entry.itemId === itemId);

      if (!item || !selectedInput) {
        results.push({
          itemId,
          status: 'FAILED',
          message: 'Item selecionado nao foi localizado na fatura',
          createdTransactionIds: []
        });
        continue;
      }

      const description = selectedInput.description.trim();
      if (!description) {
        results.push({
          itemId,
          status: 'FAILED',
          message: 'Descricao do lancamento e obrigatoria',
          createdTransactionIds: []
        });
        continue;
      }

      if (!item.canImport) {
        results.push({
          itemId,
          status: 'SKIPPED_NOT_IMPORTABLE',
          message: item.nonImportableReason || 'Item nao pode ser importado',
          createdTransactionIds: []
        });
        continue;
      }

      const classification = classifyMatches(
        item,
        candidates,
        statement.referenceYear,
        statement.referenceMonth
      );

      if (classification.status === 'OK' || classification.reason === 'AMBIGUOUS_EXACT') {
        const hasProjectedFixedMatch = classification.matchedTransactions.some(
          (candidate) => candidate.matchSource === 'PROJECTED_FIXED'
        );

        results.push({
          itemId,
          status: 'SKIPPED_DUPLICATE',
          message: hasProjectedFixedMatch
            ? 'Ja existe fixa equivalente prevista no cartao'
            : 'Ja existe lancamento equivalente no cartao',
          createdTransactionIds: []
        });
        continue;
      }

      try {
        const created = await FinancialTransactionService.createTransaction({
          description,
          amount: Number(item.amount),
          date: item.createDate,
          dueDate: item.createDate,
          effectiveDate: item.createDate,
          type: TransactionType.EXPENSE,
          status: TransactionStatus.COMPLETED,
          notes: buildImportNote(params.sourceType, item),
          importSourceType: params.sourceType,
          importSourceDescription: item.sourceDescription,
          fromAccountId: params.accountId,
          categoryId: selectedInput.categoryId,
          companyId: params.companyId,
          createdBy: params.userId,
          installmentCount: item.totalInstallments ?? 1,
          creditCardInvoiceReference: importedStatementInvoiceReference,
          creditCardInvoiceAnchorInstallmentNumber: item.installmentNumber ?? 1
        });
        const createdTransactions = normalizeCreatedTransactions(created);

        for (const transaction of createdTransactions) {
          candidates = [
            {
              matchKey: `transaction:${transaction.id}`,
              matchSource: 'TRANSACTION',
              id: transaction.id,
              fixedTemplateId: null,
              occurrenceKey: null,
              description: transaction.description,
              amount: new Prisma.Decimal(transaction.amount.toString()),
              date: transaction.date,
              installmentNumber: transaction.installmentNumber,
              totalInstallments: transaction.totalInstallments,
              status: transaction.status,
              purchaseGroupId: transaction.purchaseGroupId,
              importSourceType: params.sourceType,
              importSourceDescription: item.sourceDescription,
              creditCardInvoice: null
            },
            ...candidates
          ];
        }

        results.push({
          itemId,
          status: 'CREATED',
          message: 'Lancamento criado com sucesso',
          createdTransactionIds: createdTransactions.map((transaction) => transaction.id)
        });
      } catch (error: any) {
        results.push({
          itemId,
          status: 'FAILED',
          message: error.message || 'Erro ao criar lancamento',
          createdTransactionIds: []
        });
      }
    }

    return {
      statement: {
        sourceType: statement.sourceType,
        fileName: statement.fileName,
        dueDate: statement.dueDate.toISOString(),
        totalAmount: statement.totalAmount,
        parsedNetAmount: statement.parsedNetAmount,
        referenceYear: statement.referenceYear,
        referenceMonth: statement.referenceMonth
      },
      summary: {
        selectedCount: selectedItemIds.length,
        createdCount: results.filter((result) => result.status === 'CREATED').length,
        skippedDuplicateCount: results.filter((result) => result.status === 'SKIPPED_DUPLICATE').length,
        skippedNotImportableCount: results.filter((result) => result.status === 'SKIPPED_NOT_IMPORTABLE').length,
        failedCount: results.filter((result) => result.status === 'FAILED').length
      },
      results
    };
  }
}

export const __private__ = {
  parseCaixaStatementText,
  parseBradescoStatementText,
  parseNubankStatementText,
  classifyMatches
};
