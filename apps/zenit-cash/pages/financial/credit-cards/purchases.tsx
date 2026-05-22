import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  getInvoiceReferenceLabel
} from '@/utils/creditCards';
import {
  formatCalendarDate,
  getTransactionDisplayStatus,
  getTransactionDisplayStatusClasses,
  getTransactionDisplayStatusLabel
} from '@/utils/financialStatus';

interface CreditCardAccount {
  id: number;
  name: string;
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

const PAGE_SIZE = 20;

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
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
  const { addToast } = useToast();
  const [cards, setCards] = useState<CreditCardAccount[]>([]);
  const [purchases, setPurchases] = useState<CreditCardPurchaseListItem[]>([]);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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

  useEffect(() => {
    void fetchCards();
  }, []);

  useEffect(() => {
    if (!router.isReady || cardsLoading || filtersInitialized) {
      return;
    }

    const availableIds = cards.map((card) => card.id.toString());

    if (requestedCardId && availableIds.includes(requestedCardId)) {
      setSelectedCardIds([requestedCardId]);
    } else {
      setSelectedCardIds(availableIds);
    }

    setFiltersInitialized(true);
  }, [cards, cardsLoading, filtersInitialized, requestedCardId, router.isReady]);

  useEffect(() => {
    if (!filtersInitialized) {
      return;
    }

    const availableIdSet = new Set(cards.map((card) => card.id.toString()));
    setSelectedCardIds((previous) => previous.filter((value) => availableIdSet.has(value)));
  }, [cards, filtersInitialized]);

  useEffect(() => {
    if (!filtersInitialized) {
      return;
    }

    if (selectedCardIds.length === 0) {
      setPurchases([]);
      setExpandedKeys([]);
      setLoading(false);
      setTotalPages(1);
      return;
    }

    void fetchPurchases();
  }, [currentPage, filtersInitialized, selectedCardIds]);

  useEffect(() => {
    const availableKeys = new Set(purchases.map((purchase) => purchase.groupKey));
    setExpandedKeys((previous) => previous.filter((key) => availableKeys.has(key)));
  }, [purchases]);

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

  async function fetchPurchases() {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        pageSize: PAGE_SIZE.toString()
      });

      selectedCardIds.forEach((cardId) => params.append('accountIds', cardId));

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

  function toggleExpanded(groupKey: string) {
    setExpandedKeys((previous) =>
      previous.includes(groupKey)
        ? previous.filter((key) => key !== groupKey)
        : [...previous, groupKey]
    );
  }

  const selectedCardsSummary = `${selectedCardIds.length} de ${cards.length} cartão${
    cards.length === 1 ? '' : 'es'
  } selecionado${selectedCardIds.length === 1 ? '' : 's'}`;

  return (
    <DashboardLayout title="Compras no Cartão">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartões e Faturas', href: '/financial/credit-cards' },
          { label: 'Compras no Cartão' }
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Compras no Cartão</h1>
          <p className="mt-1 text-sm text-gray-400">
            Visualize compras agrupadas por cartão com valor total e detalhe das parcelas.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/financial/credit-cards">
            <Button variant="outline" className="flex items-center gap-2">
              <CreditCard size={16} />
              Cartões e Faturas
            </Button>
          </Link>
          <Link href="/financial/transactions/new-credit-card-purchase">
            <Button variant="accent" className="flex items-center gap-2">
              <Receipt size={16} />
              Nova Compra no Cartão
            </Button>
          </Link>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <MultiSelect
            label="Cartões"
            options={cardOptions}
            values={selectedCardIds}
            onChange={handleCardChange}
            placeholder={cardsLoading ? 'Carregando cartões...' : 'Selecione os cartões'}
            disabled={cardsLoading}
          />
          <div className="rounded-lg border border-gray-700 bg-[#12161d] px-4 py-3 text-sm text-gray-300">
            {selectedCardsSummary}
          </div>
        </div>
      </Card>

      {cardsLoading ? (
        <Card>
          <div className="flex items-center justify-center gap-3 py-12 text-gray-300">
            <Loader2 size={18} className="animate-spin" />
            Carregando cartões...
          </div>
        </Card>
      ) : cards.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <CreditCard size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400">Nenhum cartão de crédito disponível.</p>
          </div>
        </Card>
      ) : selectedCardIds.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <CreditCard size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-300">Selecione ao menos um cartão para ver as compras.</p>
          </div>
        </Card>
      ) : loading ? (
        <Card>
          <div className="flex items-center justify-center gap-3 py-12 text-gray-300">
            <Loader2 size={18} className="animate-spin" />
            Carregando compras...
          </div>
        </Card>
      ) : purchases.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Receipt size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-300">Nenhuma compra encontrada para os cartões selecionados.</p>
          </div>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-[#0f1419] text-left text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="w-14 px-4 py-3">Detalhe</th>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Cartão</th>
                    <th className="px-4 py-3">Compra</th>
                    <th className="px-4 py-3">Parcelas</th>
                    <th className="px-4 py-3 text-right">Valor da Parcela</th>
                    <th className="px-4 py-3 text-right">Valor Total</th>
                    <th className="px-4 py-3">Categoria</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => {
                    const isExpanded = expandedKeys.includes(purchase.groupKey);

                    return (
                      <React.Fragment key={purchase.groupKey}>
                        <tr className="border-t border-gray-800 bg-[#12161d] align-top text-sm">
                          <td className="px-4 py-4">
                            <button
                              type="button"
                              onClick={() => toggleExpanded(purchase.groupKey)}
                              className="rounded border border-gray-700 p-2 text-gray-300 transition-colors hover:border-accent hover:text-white"
                              title={isExpanded ? 'Ocultar parcelas' : 'Mostrar parcelas'}
                            >
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
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
                          <td className="px-4 py-4 text-gray-300">{purchase.card.name}</td>
                          <td className="px-4 py-4 text-gray-300">
                            {formatCalendarDate(purchase.purchaseDate)}
                          </td>
                          <td className="px-4 py-4 text-gray-300">
                            {purchase.installmentCount === 1 ? 'À vista' : `${purchase.installmentCount}x`}
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
                            <Link href={`/financial/transactions/${purchase.representativeTransactionId}`}>
                              <Button variant="outline" className="inline-flex items-center gap-2">
                                <ExternalLink size={14} />
                                Abrir compra
                              </Button>
                            </Link>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr className="border-t border-gray-800 bg-[#0f1419]">
                            <td colSpan={9} className="px-4 py-4">
                              <div className="mb-4 flex flex-wrap gap-3 text-sm">
                                <div className="rounded-lg border border-gray-700 bg-[#12161d] px-3 py-2 text-gray-300">
                                  Cartão: <span className="font-medium text-white">{purchase.card.name}</span>
                                </div>
                                <div className="rounded-lg border border-gray-700 bg-[#12161d] px-3 py-2 text-gray-300">
                                  Total: <span className="font-medium text-white">{formatCurrency(purchase.totalAmount)}</span>
                                </div>
                                <div className="rounded-lg border border-gray-700 bg-[#12161d] px-3 py-2 text-gray-300">
                                  Compra em: <span className="font-medium text-white">{formatCalendarDate(purchase.purchaseDate)}</span>
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
                                      const status = getInstallmentStatus(installment);

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
                                              className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.classes}`}
                                            >
                                              {status.label}
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
          </Card>

          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="text-sm text-gray-400">
              Página {currentPage} de {totalPages}
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
                Próxima
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
