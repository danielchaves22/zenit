export interface BankItem { id: number; date: string; amount: string; description: string; activeGroupId?: number | null }
export interface BankTransaction {
  id: number; description: string; amount: string; date: string; effectiveDate?: string | null; dueDate?: string | null;
  status: string; type: string; version: string;
}
export interface BankCandidate {
  key: string; itemIds: number[]; items: BankItem[]; transactions: BankTransaction[];
  amount: string; difference: string; score: number; reason: string; source: 'RULE' | 'HISTORY' | 'AI'; model?: string;
  confidence?: { level: 'HIGH' | 'MEDIUM' | 'LOW'; reasons: string[] };
}
export interface BankSearchResult {
  itemId: number;
  candidates: BankCandidate[];
  cacheId?: number;
  aiMessage?: string;
  limited?: boolean;
  error?: string;
}
export interface BankMonth { id: number; month: string; status: 'OPEN' | 'COMPLETED'; completedAt?: string | null }
export interface BankImport {
  id: number; fileName: string; bank: string; format: string; bankAccount: string | null; createdAt: string;
  metadata: { startDate: string | null; endDate: string | null; openingBalance: string | null; closingBalance: string | null; balanceDate: string | null; warnings?: string[] };
}
export interface BankWorkspace {
  account: { id: number; name: string; isActive: boolean }; month: string; session: BankMonth | null;
  items: BankItem[]; page: number; pageSize: number; total: number;
  summary: { total: number; pending: number; confirmed: number; credits: string; debits: string; unmatchedTransactions: number; restrictedTransactions: number };
  imports: BankImport[]; history: BankMonth[];
}
export interface BankPreview {
  bank: string; format: string; accountNumber: string | null; startDate: string | null; endDate: string | null;
  openingBalance: string | null; closingBalance: string | null; balanceDate: string | null;
  inMonth: number; outsideCount: number; total: number; existing: number; credits: string; debits: string;
  sample: BankItem[]; outside: BankItem[]; warnings: string[];
}
export interface BankAuditGroup {
  id: number; status: string; createdAt: string; createdBy: number; note?: string;
  items: Array<{ item: BankItem }>;
  transactions: Array<{ id: number; restricted?: boolean; originalTransactionId?: number; snapshot?: BankTransaction; transaction?: BankTransaction | null }>;
}
export interface BankAudit { groups: BankAuditGroup[]; total: number; page: number; pageSize: number; events: Array<{ id: number; action: string; createdAt: string; userId: number | null }> }
export const bankCurrency = (amount: string | number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount));
export const bankDate = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
export const bankTimestamp = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
export const bankTotal = (items: Array<{ amount: string }>) => items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0) / 100;
