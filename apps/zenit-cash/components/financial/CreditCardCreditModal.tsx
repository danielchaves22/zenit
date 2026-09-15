import React, { useEffect, useMemo, useState } from 'react';
import {
  RotateCcw,
  Sparkles,
  SlidersHorizontal,
  type LucideIcon
} from 'lucide-react';
import CategorySelect, { type CategoryOption } from './CategorySelect';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { formatCalendarDate, getTodayDateValue } from '@/utils/financialStatus';

export type CreditCardCreditKind = 'REFUND' | 'CASHBACK' | 'ADJUSTMENT';

export interface CreditCardCreditPayload {
  description: string;
  amount: number;
  date: string;
  creditKind: CreditCardCreditKind;
  refundOfTransactionId?: number;
  categoryId?: number;
  notes?: string;
}

interface RefundablePurchase {
  id: number;
  description: string;
  amount: string;
  refundedAmount: string;
  remainingAmount: string;
  date: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
}

interface IncomeCategory extends CategoryOption {
  type?: string;
}

interface CreditCardCreditModalProps {
  isOpen: boolean;
  accountId: number;
  title?: string;
  submitting?: boolean;
  initialDescription?: string;
  initialAmount?: string | number;
  initialDate?: string;
  initialCreditKind?: CreditCardCreditKind;
  lockStatementFields?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreditCardCreditPayload) => void | Promise<void>;
}

const KIND_OPTIONS: Array<{
  value: CreditCardCreditKind;
  label: string;
  icon: LucideIcon;
}> = [
  { value: 'REFUND', label: 'Estorno', icon: RotateCcw },
  { value: 'CASHBACK', label: 'Cashback', icon: Sparkles },
  { value: 'ADJUSTMENT', label: 'Ajuste', icon: SlidersHorizontal }
];

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

export function CreditCardCreditModal({
  isOpen,
  accountId,
  title = 'Adicionar crédito à fatura',
  submitting = false,
  initialDescription = '',
  initialAmount = '0',
  initialDate,
  initialCreditKind = 'REFUND',
  lockStatementFields = false,
  onClose,
  onSubmit
}: CreditCardCreditModalProps) {
  const [creditKind, setCreditKind] = useState<CreditCardCreditKind>(initialCreditKind);
  const [description, setDescription] = useState(initialDescription);
  const [amount, setAmount] = useState(String(initialAmount));
  const [date, setDate] = useState(initialDate || getTodayDateValue());
  const [categoryId, setCategoryId] = useState('');
  const [refundOfTransactionId, setRefundOfTransactionId] = useState('');
  const [notes, setNotes] = useState('');
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [purchases, setPurchases] = useState<RefundablePurchase[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setCreditKind(initialCreditKind);
    setDescription(initialDescription);
    setAmount(String(initialAmount));
    setDate(initialDate || getTodayDateValue());
    setCategoryId('');
    setRefundOfTransactionId('');
    setNotes('');
    setPurchaseSearch('');
    setError(null);
  }, [initialAmount, initialCreditKind, initialDate, initialDescription, isOpen]);

  useEffect(() => {
    if (!isOpen || !Number.isFinite(accountId)) return;

    let active = true;
    setLoadingOptions(true);
    Promise.all([
      api.get('/financial/categories', { params: { type: 'INCOME' } }),
      api.get(`/financial/credit-cards/${accountId}/refundable-purchases`)
    ])
      .then(([categoryResponse, purchaseResponse]) => {
        if (!active) return;
        const nextCategories = (categoryResponse.data || []).filter(
          (category: IncomeCategory) => !category.type || category.type === 'INCOME'
        );
        setCategories(nextCategories);
        setPurchases(purchaseResponse.data || []);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError.response?.data?.error ||
          'Não foi possível carregar as opções do crédito'
        );
      })
      .finally(() => active && setLoadingOptions(false));

    return () => {
      active = false;
    };
  }, [accountId, isOpen]);

  const filteredPurchases = useMemo(() => {
    const search = purchaseSearch.trim().toLocaleLowerCase('pt-BR');
    if (!search) return purchases;
    return purchases.filter((purchase) =>
      purchase.description.toLocaleLowerCase('pt-BR').includes(search)
    );
  }, [purchaseSearch, purchases]);

  const selectedPurchase = purchases.find(
    (purchase) => String(purchase.id) === refundOfTransactionId
  );

  function selectCreditKind(nextKind: CreditCardCreditKind) {
    setCreditKind(nextKind);
    setRefundOfTransactionId('');
    setPurchaseSearch('');
    setError(null);
  }

  function selectPurchase(nextId: string) {
    setRefundOfTransactionId(nextId);
    const purchase = purchases.find((item) => String(item.id) === nextId);
    if (!purchase) return;

    if (!lockStatementFields) {
      setAmount(purchase.remainingAmount);
    }
    if (!description.trim()) {
      setDescription(`Estorno - ${purchase.description}`);
    }
  }

  async function handleSubmit() {
    setError(null);
    const numericAmount = Number(amount);

    if (!description.trim()) {
      setError('Informe a descrição do crédito');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Informe um valor de crédito maior que zero');
      return;
    }
    if (!date) {
      setError('Informe a data do crédito');
      return;
    }
    if (creditKind === 'REFUND' && !refundOfTransactionId) {
      setError('Selecione a compra original do estorno');
      return;
    }
    if (
      creditKind === 'REFUND' &&
      selectedPurchase &&
      numericAmount > Number(selectedPurchase.remainingAmount)
    ) {
      setError(`O estorno não pode exceder ${formatCurrency(selectedPurchase.remainingAmount)}`);
      return;
    }

    await onSubmit({
      description: description.trim(),
      amount: numericAmount,
      date,
      creditKind,
      refundOfTransactionId:
        creditKind === 'REFUND' ? Number(refundOfTransactionId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      notes: notes.trim() || undefined
    });
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      loading={submitting}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={() => void handleSubmit()} disabled={submitting || loadingOptions}>
            {submitting ? 'Lançando...' : 'Adicionar crédito'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 text-sm font-medium text-gray-300">Natureza</div>
          <div className="grid grid-cols-3 gap-1 rounded border border-gray-700 bg-background p-1">
            {KIND_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = creditKind === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectCreditKind(option.value)}
                  disabled={submitting}
                  className={`flex min-h-10 items-center justify-center gap-1.5 rounded px-2 text-sm font-medium transition-colors ${
                    selected
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-elevated hover:text-white'
                  }`}
                >
                  <Icon size={15} />
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {creditKind === 'REFUND' && (
          <div className="space-y-2">
            <Input
              label="Localizar compra"
              value={purchaseSearch}
              onChange={(event) => setPurchaseSearch(event.target.value)}
              placeholder="Descrição da compra"
              disabled={submitting || loadingOptions}
              className="mb-0"
            />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-300">
                Compra original
              </label>
              <select
                value={refundOfTransactionId}
                onChange={(event) => selectPurchase(event.target.value)}
                disabled={submitting || loadingOptions}
                className="min-h-10 w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring"
              >
                <option value="">
                  {loadingOptions ? 'Carregando compras...' : 'Selecione a compra'}
                </option>
                {filteredPurchases.map((purchase) => (
                  <option key={purchase.id} value={purchase.id}>
                    {purchase.description} · {formatCalendarDate(purchase.date)} · saldo {formatCurrency(purchase.remainingAmount)}
                  </option>
                ))}
              </select>
              {selectedPurchase && (
                <p className="mt-1 text-xs text-gray-400">
                  Compra {formatCurrency(selectedPurchase.amount)} · já estornado {formatCurrency(selectedPurchase.refundedAmount)}
                </p>
              )}
            </div>
          </div>
        )}

        <Input
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={submitting}
          className="mb-0"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CurrencyInput
            id="credit-card-credit-amount"
            label="Valor do crédito"
            value={amount}
            onChange={setAmount}
            disabled={submitting || lockStatementFields}
            required
            className="mb-0"
          />
          <Input
            id="credit-card-credit-date"
            label="Data"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={submitting || lockStatementFields}
            className="mb-0"
          />
        </div>

        <CategorySelect
          label="Categoria de receita (opcional)"
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
          placeholder="Sem categoria"
          disabled={submitting || loadingOptions}
        />

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">Observações</label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Opcional"
            disabled={submitting}
            className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
          />
        </div>

        {error && (
          <div role="alert" className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
