import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageGuard } from '@/components/ui/AccessGuard';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import {
  CreditCard,
  Edit2,
  Plus,
  Receipt,
  Trash2,
  Wallet
} from 'lucide-react';
import api from '@/lib/api';
import {
  getAvailableCreditLimit,
  getInvoiceDisplayStatus,
  getInvoiceDisplayStatusClasses,
  getInvoiceDisplayStatusLabel,
  getInvoiceReferenceLabel,
  getUsedCreditLimit
} from '@/utils/creditCards';
import { formatCalendarDate } from '@/utils/financialStatus';

interface CreditCardInvoiceSummary {
  id: number;
  referenceYear: number;
  referenceMonth: number;
  dueDate?: string | null;
  totalAmount: string;
  status: string;
  displayStatus?: string;
}

interface CreditCardAccount {
  id: number;
  name: string;
  type: 'CREDIT_CARD';
  balance: string;
  bankName?: string | null;
  accountNumber?: string | null;
  creditLimit?: string | null;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
  isActive?: boolean;
  nextInvoice?: CreditCardInvoiceSummary | null;
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function CreditCardsPageInner() {
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const [cards, setCards] = useState<CreditCardAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetchCards();
  }, []);

  async function fetchCards() {
    setLoading(true);

    try {
      const response = await api.get('/financial/credit-cards');
      setCards(response.data || []);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar cartões', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(card: CreditCardAccount) {
    confirmation.confirm(
      {
        title: 'Excluir Cartão',
        message: `Tem certeza que deseja excluir o cartão "${card.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/accounts/${card.id}`);
          addToast('Cartão excluído com sucesso', 'success');
          await fetchCards();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir cartão', 'error');
          throw error;
        }
      }
    );
  }

  return (
    <DashboardLayout title="Cartões e Faturas">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartões e Faturas' }
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cartões e Faturas</h1>
          <p className="mt-1 text-sm text-gray-400">
            Cadastre cartões, acompanhe limite disponível e gerencie as faturas.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/financial/accounts">
            <Button variant="outline" className="flex items-center gap-2">
              <Wallet size={16} />
              Contas
            </Button>
          </Link>
          <Link href="/financial/transactions/new-credit-card-purchase">
            <Button variant="outline" className="flex items-center gap-2">
              <Receipt size={16} />
              Nova Compra no Cartão
            </Button>
          </Link>
          <Link href="/financial/credit-cards/new">
            <Button variant="accent" className="flex items-center gap-2">
              <Plus size={16} />
              Novo Cartão
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {[...Array(4)].map((_, index) => (
            <Card key={index}>
              <div className="h-40 animate-pulse rounded bg-[#1b212c]" />
            </Card>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <CreditCard size={48} className="mx-auto mb-4 text-gray-500" />
            <p className="text-gray-400">Nenhum cartão de crédito encontrado.</p>
            <Link href="/financial/credit-cards/new" className="mt-4 inline-block">
              <Button variant="accent" className="flex items-center gap-2">
                <Plus size={16} />
                Criar Primeiro Cartão
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {cards.map((card) => {
            const availableLimit = getAvailableCreditLimit(card);
            const usedLimit = getUsedCreditLimit(card);
            const nextInvoiceStatus = card.nextInvoice
              ? getInvoiceDisplayStatus(card.nextInvoice.status, card.nextInvoice.dueDate)
              : 'OPEN';

            return (
              <Card key={card.id} className={`border border-gray-700 ${card.isActive === false ? 'opacity-70' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <CreditCard size={18} className="text-purple-300" />
                      <h2 className="text-lg font-semibold text-white">{card.name}</h2>
                    </div>
                    <div className="mt-1 text-sm text-gray-400">
                      {card.bankName || 'Cartão sem banco informado'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Fecha dia {card.statementClosingDay || '-'} • vence dia {card.statementDueDay || '-'}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Link href={`/financial/transactions/new-credit-card-purchase?cardId=${card.id}`}>
                      <Button variant="outline" className="flex items-center gap-2">
                        <Receipt size={14} />
                        Comprar
                      </Button>
                    </Link>
                    <Link href={`/financial/credit-cards/${card.id}`}>
                      <Button variant="outline" className="flex items-center gap-2">
                        <Edit2 size={14} />
                        Editar
                      </Button>
                    </Link>
                    <Link href={`/financial/credit-cards/${card.id}/invoices`}>
                      <Button variant="outline">Faturas</Button>
                    </Link>
                    <button
                      onClick={() => void handleDelete(card)}
                      className="rounded border border-red-700 px-3 py-1.5 text-sm font-semibold text-red-300 transition-colors hover:bg-red-950/40 hover:text-red-200"
                      title="Excluir cartão"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-gray-700 bg-[#11161d] p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Limite total</div>
                    <div className="mt-1 text-lg font-semibold text-white">
                      {card.creditLimit ? formatCurrency(card.creditLimit) : 'Não configurado'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-gray-700 bg-[#11161d] p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Usado</div>
                    <div className="mt-1 text-lg font-semibold text-white">{formatCurrency(usedLimit)}</div>
                  </div>
                  <div className="rounded-lg border border-gray-700 bg-[#11161d] p-3">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Disponível</div>
                    <div className={`mt-1 text-lg font-semibold ${availableLimit !== null && availableLimit < 0 ? 'text-orange-300' : 'text-white'}`}>
                      {availableLimit === null ? 'Não configurado' : formatCurrency(availableLimit)}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-gray-700 bg-[#0f1419] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-white">Próxima fatura</div>
                      {card.nextInvoice ? (
                        <div className="mt-1 text-sm text-gray-300">
                          {getInvoiceReferenceLabel(
                            card.nextInvoice.referenceYear,
                            card.nextInvoice.referenceMonth
                          )}
                        </div>
                      ) : (
                        <div className="mt-1 text-sm text-gray-400">Nenhuma fatura em aberto</div>
                      )}
                    </div>
                    {card.nextInvoice && (
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${getInvoiceDisplayStatusClasses(nextInvoiceStatus)}`}>
                        {getInvoiceDisplayStatusLabel(nextInvoiceStatus)}
                      </span>
                    )}
                  </div>

                  {card.nextInvoice && (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">Valor</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {formatCurrency(card.nextInvoice.totalAmount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-wide text-gray-400">Vencimento</div>
                        <div className="mt-1 text-lg font-semibold text-white">
                          {card.nextInvoice.dueDate
                            ? formatCalendarDate(card.nextInvoice.dueDate)
                            : '-'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={confirmation.handleClose}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.options.title}
        message={confirmation.options.message}
        confirmText={confirmation.options.confirmText}
        cancelText={confirmation.options.cancelText}
        type={confirmation.options.type}
        loading={confirmation.loading}
      />
    </DashboardLayout>
  );
}

export default function CreditCardsPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS">
      <CreditCardsPageInner />
    </PageGuard>
  );
}
