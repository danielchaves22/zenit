import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt,
  Trash2
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { useToast } from '@/components/ui/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';
import {
  getAvailableCreditLimit,
  getInvoiceReferenceLabel,
  getUsedCreditLimit
} from '@/utils/creditCards';
import {
  formatCalendarDate,
  getTransactionDisplayStatus,
  getTransactionDisplayStatusClasses,
  getTransactionDisplayStatusLabel
} from '@/utils/financialStatus';
import { formatTransactionDescription } from '@/utils/transactions';

interface CreditCardAccount {
  id: number;
  name: string;
  balance?: string;
  creditLimit?: string | null;
  isActive?: boolean;
}

interface ExpenseCategory {
  id: number;
  name: string;
  type: string;
  color: string;
  icon?: string | null;
}

interface PurchaseInstallment {
  id: number;
  installmentNumber: number;
  totalInstallments: number;
  amount: string;
  dueDate: string | null;
  scheduledDate: string | null;
  status: string;
  creditCardInvoice: {
    id?: number;
    referenceYear: number;
    referenceMonth: number;
    dueDate?: string | null;
    status: string;
  } | null;
}

interface CreditCardPurchaseListItem {
  groupKey: string;
  purchaseGroupId: string | null;
  representativeTransactionId: number;
  description: string;
  notes: string;
  purchaseDate: string;
  installmentAmount: string;
  totalAmount: string;
  installmentCount: number;
  card: {
    id: number;
    name: string;
  };
  category: {
    id: number;
    name: string;
    color: string;
    icon?: string | null;
  } | null;
  installments: PurchaseInstallment[];
}

interface CardPurchaseGroup {
  cardId: string;
  card: CreditCardAccount | null;
  purchases: CreditCardPurchaseListItem[];
  listedTotalAmount: number;
}

const PAGE_SIZE = 20;

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function areStringArraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function getInstallmentStatus(installment: PurchaseInstallment) {
  const displayStatus = getTransactionDisplayStatus({
    status: installment.status,
    dueDate: installment.dueDate,
    creditCardInvoice: installment.creditCardInvoice
  });

  return {
    label: getTransactionDisplayStatusLabel(displayStatus.status),
    classes: getTransactionDisplayStatusClasses(displayStatus.status)
  };
}

function CreditCardPurchasesPageInner() {
  const router = useRouter();
  const confirmation = useConfirmation();
  const { isCompanyOwner } = useAuth();
  const { addToast } = useToast();
  const [cards, setCards] = useState<CreditCardAccount[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [purchases, setPurchases] = useState<CreditCardPurchaseListItem[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [expandedPurchaseKeys, setExpandedPurchaseKeys] = useState<string[]>([]);
  const [expandedCardIds, setExpandedCardIds] = useState<string[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [cardGroupsInitialized, setCardGroupsInitialized] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [deletingPurchaseKey, setDeletingPurchaseKey] = useState<string | null>(null);

  const requestedCardId =
    typeof router.query.cardId === 'string' && router.query.cardId.length > 0
      ? router.query.cardId
      : null;

  const cardOptions = useMemo(
    () =>
      cards.map((card) => ({
        value: card.id.toString(),
        label: card.name
      })),
    [cards]
  );
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        value: category.id.toString(),
        label: category.name
      })),
    [categories]
  );
  const cardsById = useMemo(
    () => new Map(cards.map((card) => [card.id.toString(), card])),
    [cards]
  );
  const hasCategoryOptions = categoryOptions.length > 0;
  const filtersLoading = cardsLoading || categoriesLoading;
  const shouldBlockPurchaseFetch =
    selectedCardIds.length === 0 || (hasCategoryOptions && selectedCategoryIds.length === 0);
  const shouldApplyCategoryFilter =
    hasCategoryOptions &&
    selectedCategoryIds.length > 0 &&
    selectedCategoryIds.length < categoryOptions.length;
  const purchaseGroupsByCard = useMemo<CardPurchaseGroup[]>(() => {
    const groups = new Map<string, CardPurchaseGroup>();

    for (const purchase of purchases) {
      const cardId = purchase.card.id.toString();
      const existing = groups.get(cardId);

      if (existing) {
        existing.purchases.push(purchase);
        existing.listedTotalAmount += Number(purchase.totalAmount || 0);
        continue;
      }

      groups.set(cardId, {
        cardId,
        card: cardsById.get(cardId) || null,
        purchases: [purchase],
        listedTotalAmount: Number(purchase.totalAmount || 0)
      });
    }

    return Array.from(groups.values());
  }, [cardsById, purchases]);

  useEffect(() => {
    void Promise.all([fetchCards(), fetchCategories()]);
  }, []);

  useEffect(() => {
    if (!router.isReady || filtersLoading || filtersInitialized) {
      return;
    }

    const availableCardIds = cards.map((card) => card.id.toString());
    const availableCategoryIds = categories.map((category) => category.id.toString());
    const nextSelectedCardIds =
      requestedCardId && availableCardIds.includes(requestedCardId)
        ? [requestedCardId]
        : availableCardIds;

    setSelectedCategoryIds(availableCategoryIds);
    setSelectedCardIds(nextSelectedCardIds);
    setFiltersInitialized(true);
  }, [cards, categories, filtersInitialized, filtersLoading, requestedCardId, router.isReady]);

  useEffect(() => {
    if (!filtersInitialized) {
      return;
    }

    const availableIdSet = new Set(cards.map((card) => card.id.toString()));

    setSelectedCardIds((previous) => {
      const nextValues = previous.filter((value) => availableIdSet.has(value));
      return areStringArraysEqual(previous, nextValues) ? previous : nextValues;
    });
  }, [cards, filtersInitialized]);

  useEffect(() => {
    if (!filtersInitialized) {
      return;
    }

    const availableIdSet = new Set(categories.map((category) => category.id.toString()));

    setSelectedCategoryIds((previous) => {
      const nextValues = previous.filter((value) => availableIdSet.has(value));
      return areStringArraysEqual(previous, nextValues) ? previous : nextValues;
    });
  }, [categories, filtersInitialized]);

  useEffect(() => {
    if (!filtersInitialized) {
      return;
    }

    if (shouldBlockPurchaseFetch) {
      setPurchases([]);
      setExpandedPurchaseKeys([]);
      setExpandedCardIds([]);
      setCardGroupsInitialized(false);
      setLoading(false);
      setTotalPages(1);
      return;
    }

    void fetchPurchases();
  }, [
    currentPage,
    filtersInitialized,
    selectedCardIds,
    selectedCategoryIds,
    shouldApplyCategoryFilter,
    shouldBlockPurchaseFetch
  ]);

  useEffect(() => {
    const availableKeys = new Set(purchases.map((purchase) => purchase.groupKey));

    setExpandedPurchaseKeys((previous) => {
      const nextValues = previous.filter((key) => availableKeys.has(key));
      return areStringArraysEqual(previous, nextValues) ? previous : nextValues;
    });
  }, [purchases]);

  useEffect(() => {
    const visibleCardIds = purchaseGroupsByCard.map((group) => group.cardId);

    if (visibleCardIds.length === 0) {
      setExpandedCardIds([]);
      setCardGroupsInitialized(false);
      return;
    }

    if (!cardGroupsInitialized) {
      setExpandedCardIds(visibleCardIds);
      setCardGroupsInitialized(true);
      return;
    }

    setExpandedCardIds((previous) => {
      const previousSet = new Set(previous);
      const nextValues = visibleCardIds.filter((cardId) => previousSet.has(cardId));

      for (const cardId of visibleCardIds) {
        if (!previousSet.has(cardId)) {
          nextValues.push(cardId);
        }
      }

      return areStringArraysEqual(previous, nextValues) ? previous : nextValues;
    });
  }, [cardGroupsInitialized, purchaseGroupsByCard]);

  async function fetchCards() {
    setCardsLoading(true);

    try {
      const response = await api.get('/financial/credit-cards');
      setCards(response.data || []);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar cartoes', 'error');
    } finally {
      setCardsLoading(false);
    }
  }

  async function fetchCategories() {
    setCategoriesLoading(true);

    try {
      const response = await api.get('/financial/categories', {
        params: { type: 'EXPENSE' }
      });
      setCategories(response.data || []);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar categorias', 'error');
    } finally {
      setCategoriesLoading(false);
    }
  }

  async function fetchPurchases() {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: PAGE_SIZE.toString()
      });

      selectedCardIds.forEach((cardId) => params.append('accountIds', cardId));

      if (shouldApplyCategoryFilter) {
        selectedCategoryIds.forEach((categoryId) => params.append('categoryIds', categoryId));
      }

      const response = await api.get(`/financial/credit-card-purchases?${params.toString()}`);
      const nextPages = Number(response.data.pages || 1);

      if (currentPage > nextPages) {
        setCurrentPage(nextPages);
        return;
      }

      setPurchases(response.data.data || []);
      setTotalPages(nextPages);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar compras no cartao', 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleCardChange(values: string[]) {
    setCurrentPage(1);
    setSelectedCardIds(values);
  }

  function handleCategoryChange(values: string[]) {
    setCurrentPage(1);
    setSelectedCategoryIds(values);
  }

  function toggleCardGroup(cardId: string) {
    setExpandedCardIds((previous) =>
      previous.includes(cardId)
        ? previous.filter((value) => value !== cardId)
        : [...previous, cardId]
    );
  }

  function togglePurchaseDetails(groupKey: string) {
    setExpandedPurchaseKeys((previous) =>
      previous.includes(groupKey)
        ? previous.filter((value) => value !== groupKey)
        : [...previous, groupKey]
    );
  }

  function handleDeletePurchase(purchase: CreditCardPurchaseListItem) {
    const scopeLabel = purchase.purchaseGroupId ? 'a compra inteira' : 'a compra';

    confirmation.confirm(
      {
        title: 'Confirmar Exclusao',
        message: `Tem certeza que deseja excluir ${scopeLabel} "${formatTransactionDescription(
          purchase.description
        )}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        setDeletingPurchaseKey(purchase.groupKey);

        try {
          await api.delete(`/financial/transactions/${purchase.representativeTransactionId}`, {
            params: purchase.purchaseGroupId ? { scope: 'purchase' } : undefined
          });
          addToast('Compra excluida com sucesso', 'success');
          await fetchPurchases();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir compra no cartao', 'error');
          throw error;
        } finally {
          setDeletingPurchaseKey((current) =>
            current === purchase.groupKey ? null : current
          );
        }
      }
    );
  }

  const selectedCardsSummary = `${selectedCardIds.length} de ${cards.length} cartao${
    cards.length === 1 ? '' : 'es'
  } selecionado${selectedCardIds.length === 1 ? '' : 's'}`;
  const selectedCategoriesSummary = !hasCategoryOptions
    ? 'Sem categorias de despesa cadastradas'
    : selectedCategoryIds.length === categoryOptions.length
      ? categoryOptions.length === 1
        ? 'A unica categoria cadastrada'
        : `Todas as ${categoryOptions.length} categorias`
      : `${selectedCategoryIds.length} de ${categoryOptions.length} categoria${
          categoryOptions.length === 1 ? '' : 's'
        } selecionada${selectedCategoryIds.length === 1 ? '' : 's'}`;

  return (
    <DashboardLayout title="Compras no Cartao">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartoes e Faturas', href: '/financial/credit-cards' },
          { label: 'Compras no Cartao' }
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Compras no Cartao</h1>
          <p className="mt-1 text-sm text-gray-400">
            Visualize compras agrupadas por cartao com valor total e detalhe das parcelas.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/financial/credit-cards">
            <Button variant="outline" className="flex items-center gap-2">
              <CreditCard size={16} />
              Cartoes e Faturas
            </Button>
          </Link>
          <Link href="/financial/transactions/new-credit-card-purchase">
            <Button variant="accent" className="flex items-center gap-2">
              <Receipt size={16} />
              Nova Compra no Cartao
            </Button>
          </Link>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <MultiSelect
            label="Cartoes"
            options={cardOptions}
            values={selectedCardIds}
            onChange={handleCardChange}
            placeholder={cardsLoading ? 'Carregando cartoes...' : 'Selecione os cartoes'}
            disabled={cardsLoading}
          />
          <MultiSelect
            label="Categorias"
            options={categoryOptions}
            values={selectedCategoryIds}
            onChange={handleCategoryChange}
            placeholder={
              categoriesLoading
                ? 'Carregando categorias...'
                : hasCategoryOptions
                  ? 'Selecione as categorias'
                  : 'Nenhuma categoria de despesa'
            }
            disabled={categoriesLoading || !hasCategoryOptions}
          />
          <div className="rounded-lg border border-gray-700 bg-[#12161d] px-4 py-3 text-sm text-gray-300">
            <div>{selectedCardsSummary}</div>
            <div className="mt-2">{selectedCategoriesSummary}</div>
          </div>
        </div>
      </Card>

      {filtersLoading ? (
        <Card>
          <div className="flex items-center justify-center gap-3 py-12 text-gray-300">
            <Loader2 size={18} className="animate-spin" />
            Carregando filtros...
          </div>
        </Card>
      ) : cards.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <CreditCard size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400">Nenhum cartao de credito disponivel.</p>
          </div>
        </Card>
      ) : selectedCardIds.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <CreditCard size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-300">Selecione ao menos um cartao para ver as compras.</p>
          </div>
        </Card>
      ) : hasCategoryOptions && selectedCategoryIds.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Receipt size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-300">Selecione ao menos uma categoria para ver as compras.</p>
          </div>
        </Card>
      ) : loading ? (
        <Card>
          <div className="flex items-center justify-center gap-3 py-12 text-gray-300">
            <Loader2 size={18} className="animate-spin" />
            Carregando compras...
          </div>
        </Card>
      ) : purchaseGroupsByCard.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Receipt size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-300">
              Nenhuma compra encontrada para os filtros selecionados.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="space-y-4">
            {purchaseGroupsByCard.map((group) => {
              const card = group.card;
              const isExpanded = expandedCardIds.includes(group.cardId);
              const usedLimit = card ? getUsedCreditLimit(card) : 0;
              const availableLimit = card ? getAvailableCreditLimit(card) : null;

              return (
                <Card key={group.cardId} className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => toggleCardGroup(group.cardId)}
                    className="flex w-full flex-col gap-4 border-b border-gray-800 bg-[#12161d] px-5 py-4 text-left transition-colors hover:bg-[#171c24]"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg border border-gray-700 bg-[#0f1419] p-2 text-gray-300">
                          {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-white">
                            {card?.name || group.purchases[0].card.name}
                          </div>
                          <div className="mt-1 text-sm text-gray-400">
                            {group.purchases.length} compra{group.purchases.length === 1 ? '' : 's'} nesta pagina
                            {' '}• Total listado: {formatCurrency(group.listedTotalAmount)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-gray-700 bg-[#0f1419] px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Limite</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {card?.creditLimit ? formatCurrency(card.creditLimit) : 'Nao configurado'}
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-700 bg-[#0f1419] px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Consumido</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {formatCurrency(usedLimit)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-gray-700 bg-[#0f1419] px-4 py-3">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Disponivel</div>
                        <div className={`mt-1 text-lg font-semibold ${
                          availableLimit !== null && availableLimit < 0 ? 'text-orange-300' : 'text-white'
                        }`}>
                          {availableLimit === null ? 'Nao configurado' : formatCurrency(availableLimit)}
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[980px]">
                        <thead className="bg-[#0f1419] text-left text-xs uppercase tracking-wide text-gray-400">
                          <tr>
                            <th className="w-14 px-4 py-3">Detalhe</th>
                            <th className="px-4 py-3">Descricao</th>
                            <th className="px-4 py-3">Compra</th>
                            <th className="px-4 py-3">Parcelas</th>
                            <th className="px-4 py-3 text-right">Valor da Parcela</th>
                            <th className="px-4 py-3 text-right">Valor Total</th>
                            <th className="px-4 py-3">Categoria</th>
                            <th className="px-4 py-3 text-right">Acao</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.purchases.map((purchase) => {
                            const isPurchaseExpanded = expandedPurchaseKeys.includes(purchase.groupKey);
                            const isDeletingPurchase = deletingPurchaseKey === purchase.groupKey;

                            return (
                              <React.Fragment key={purchase.groupKey}>
                                <tr className="border-t border-gray-800 bg-[#12161d] align-top text-sm">
                                  <td className="px-4 py-4">
                                    <button
                                      type="button"
                                      onClick={() => togglePurchaseDetails(purchase.groupKey)}
                                      className="rounded border border-gray-700 p-2 text-gray-300 transition-colors hover:border-accent hover:text-white"
                                      title={isPurchaseExpanded ? 'Ocultar parcelas' : 'Mostrar parcelas'}
                                    >
                                      {isPurchaseExpanded ? (
                                        <ChevronDown size={16} />
                                      ) : (
                                        <ChevronRight size={16} />
                                      )}
                                    </button>
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="font-medium text-white">{purchase.description}</div>
                                    <div className="mt-1 text-xs text-gray-400">
                                      {purchase.purchaseGroupId
                                        ? `${purchase.installmentCount} parcela${purchase.installmentCount === 1 ? '' : 's'}`
                                        : 'Compra legada'}
                                    </div>
                                    {purchase.notes && (
                                      <div className="mt-2 text-xs text-gray-400">{purchase.notes}</div>
                                    )}
                                  </td>
                                  <td className="px-4 py-4 text-gray-300">
                                    {formatCalendarDate(purchase.purchaseDate)}
                                  </td>
                                  <td className="px-4 py-4 text-gray-300">
                                    {purchase.installmentCount === 1 ? 'A vista' : `${purchase.installmentCount}x`}
                                  </td>
                                  <td className="px-4 py-4 text-right font-medium text-gray-100">
                                    {formatCurrency(purchase.installmentAmount)}
                                  </td>
                                  <td className="px-4 py-4 text-right font-semibold text-white">
                                    {formatCurrency(purchase.totalAmount)}
                                  </td>
                                  <td className="px-4 py-4">
                                    {purchase.category ? (
                                      <span
                                        className="inline-flex rounded-full px-2 py-1 text-xs font-medium text-white"
                                        style={{ backgroundColor: purchase.category.color }}
                                      >
                                        {purchase.category.name}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500">Sem categoria</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-4 text-right">
                                    <div className="flex flex-col items-end gap-2">
                                      <Link href={`/financial/transactions/${purchase.representativeTransactionId}`}>
                                        <Button variant="outline" className="inline-flex items-center gap-2">
                                          <ExternalLink size={14} />
                                          Abrir compra
                                        </Button>
                                      </Link>
                                      {isCompanyOwner && (
                                        <Button
                                          type="button"
                                          variant="danger"
                                          onClick={() => handleDeletePurchase(purchase)}
                                          disabled={isDeletingPurchase}
                                          className="inline-flex items-center gap-2"
                                        >
                                          {isDeletingPurchase ? (
                                            <Loader2 size={14} className="animate-spin" />
                                          ) : (
                                            <Trash2 size={14} />
                                          )}
                                          {isDeletingPurchase ? 'Excluindo...' : 'Excluir compra'}
                                        </Button>
                                      )}
                                    </div>
                                  </td>
                                </tr>

                                {isPurchaseExpanded && (
                                  <tr className="border-t border-gray-800 bg-[#0f1419]">
                                    <td colSpan={8} className="px-4 py-4">
                                      <div className="mb-4 flex flex-wrap gap-3 text-sm">
                                        <div className="rounded-lg border border-gray-700 bg-[#12161d] px-3 py-2 text-gray-300">
                                          Total: <span className="font-medium text-white">{formatCurrency(purchase.totalAmount)}</span>
                                        </div>
                                        <div className="rounded-lg border border-gray-700 bg-[#12161d] px-3 py-2 text-gray-300">
                                          Compra em:{' '}
                                          <span className="font-medium text-white">
                                            {formatCalendarDate(purchase.purchaseDate)}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="overflow-x-auto rounded-lg border border-gray-700">
                                        <table className="w-full min-w-[720px]">
                                          <thead className="bg-[#12161d] text-left text-xs uppercase tracking-wide text-gray-400">
                                            <tr>
                                              <th className="px-3 py-2">Parcela</th>
                                              <th className="px-3 py-2">Fatura</th>
                                              <th className="px-3 py-2">Vencimento</th>
                                              <th className="px-3 py-2">Status</th>
                                              <th className="px-3 py-2 text-right">Valor</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {purchase.installments.map((installment) => {
                                              const installmentStatus = getInstallmentStatus(installment);

                                              return (
                                                <tr
                                                  key={installment.id}
                                                  className="border-t border-gray-800 text-sm text-gray-300"
                                                >
                                                  <td className="px-3 py-2">
                                                    {installment.installmentNumber}/{installment.totalInstallments}
                                                  </td>
                                                  <td className="px-3 py-2">
                                                    {installment.creditCardInvoice
                                                      ? getInvoiceReferenceLabel(
                                                          installment.creditCardInvoice.referenceYear,
                                                          installment.creditCardInvoice.referenceMonth
                                                        )
                                                      : '-'}
                                                  </td>
                                                  <td className="px-3 py-2">
                                                    {formatCalendarDate(
                                                      installment.creditCardInvoice?.dueDate || installment.dueDate
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2">
                                                    <span
                                                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${installmentStatus.classes}`}
                                                    >
                                                      {installmentStatus.label}
                                                    </span>
                                                  </td>
                                                  <td className="px-3 py-2 text-right font-medium text-white">
                                                    {formatCurrency(installment.amount)}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-400">
              Pagina {currentPage} de {totalPages}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((previous) => Math.max(1, previous - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((previous) => Math.min(totalPages, previous + 1))}
              >
                Proxima
              </Button>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}

export default function CreditCardPurchasesPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <CreditCardPurchasesPageInner />
    </PageGuard>
  );
}
