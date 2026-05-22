import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CreditCard,
  Edit2,
  Plus,
  Receipt,
  Trash2,
  Wallet
} from 'lucide-react';
import BankLogo from '@/components/financial/BankLogo';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { PageGuard } from '@/components/ui/AccessGuard';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';
import { FinancialBank } from '@/utils/banks';
import { getCreditCardTheme } from '@/utils/creditCardAppearance';
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
  bankId?: number | null;
  bankName?: string | null;
  bankCode?: string | null;
  bank?: FinancialBank | null;
  accountNumber?: string | null;
  creditLimit?: string | null;
  cardColor?: string | null;
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
      addToast(error.response?.data?.error || 'Erro ao carregar cartoes', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(card: CreditCardAccount) {
    confirmation.confirm(
      {
        title: 'Excluir Cartao',
        message: `Tem certeza que deseja excluir o cartao "${card.name}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/accounts/${card.id}`);
          addToast('Cartao excluido com sucesso', 'success');
          await fetchCards();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir cartao', 'error');
          throw error;
        }
      }
    );
  }

  return (
    <DashboardLayout title="Cartoes e Faturas">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Financeiro' },
          { label: 'Cartoes e Faturas' }
        ]}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Cartoes e Faturas</h1>
          <p className="mt-1 text-sm text-gray-400">
            Cadastre cartoes, acompanhe limite disponivel e gerencie as faturas.
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
              Nova Compra no Cartao
            </Button>
          </Link>
          <Link href="/financial/credit-cards/purchases">
            <Button variant="outline" className="flex items-center gap-2">
              <CreditCard size={16} />
              Compras no Cartao
            </Button>
          </Link>
          <Link href="/financial/credit-cards/new">
            <Button variant="accent" className="flex items-center gap-2">
              <Plus size={16} />
              Novo Cartao
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
            <p className="text-gray-400">Nenhum cartao de credito encontrado.</p>
            <Link href="/financial/credit-cards/new" className="mt-4 inline-block">
              <Button variant="accent" className="flex items-center gap-2">
                <Plus size={16} />
                Criar Primeiro Cartao
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
            const cardTheme = getCreditCardTheme(card.cardColor);

            return (
              <Card
                key={card.id}
                className={`border-transparent p-0 ${card.isActive === false ? 'opacity-70' : ''}`}
              >
                <div className="h-full rounded-xl border p-6" style={cardTheme.cardStyle}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <BankLogo bank={card.bank} bankName={card.bankName} />
                        <div>
                          <h2
                            className="text-lg font-semibold"
                            style={{ color: cardTheme.primaryTextColor }}
                          >
                            {card.name}
                          </h2>
                          <div
                            className="mt-1 text-sm"
                            style={{ color: cardTheme.secondaryTextColor }}
                          >
                            {card.bank?.name || card.bankName || 'Cartao sem banco informado'}
                          </div>
                        </div>
                      </div>
                      <div
                        className="mt-3 text-xs"
                        style={{ color: cardTheme.tertiaryTextColor }}
                      >
                        Fecha dia {card.statementClosingDay || '-'} - vence dia {card.statementDueDay || '-'}
                      </div>
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Link href={`/financial/transactions/new-credit-card-purchase?cardId=${card.id}`}>
                        <Button
                          variant="outline"
                          className={`flex items-center gap-2 ${cardTheme.actionClassName}`}
                        >
                          <Receipt size={14} />
                          Comprar
                        </Button>
                      </Link>
                      <Link href={`/financial/credit-cards/${card.id}`}>
                        <Button
                          variant="outline"
                          className={`flex items-center gap-2 ${cardTheme.actionClassName}`}
                        >
                          <Edit2 size={14} />
                          Editar
                        </Button>
                      </Link>
                      <Link href={`/financial/credit-cards/${card.id}/invoices`}>
                        <Button variant="outline" className={cardTheme.actionClassName}>
                          Faturas
                        </Button>
                      </Link>
                      <Link href={`/financial/credit-cards/purchases?cardId=${card.id}`}>
                        <Button variant="outline" className={cardTheme.actionClassName}>
                          Compras
                        </Button>
                      </Link>
                      <button
                        onClick={() => void handleDelete(card)}
                        className={`rounded border px-3 py-1.5 text-sm font-semibold transition-colors ${cardTheme.destructiveActionClassName}`}
                        title="Excluir cartao"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-lg border p-3" style={cardTheme.panelStyle}>
                      <div
                        className="text-xs uppercase tracking-wide"
                        style={{ color: cardTheme.tertiaryTextColor }}
                      >
                        Limite total
                      </div>
                      <div
                        className="mt-1 text-lg font-semibold"
                        style={{ color: cardTheme.primaryTextColor }}
                      >
                        {card.creditLimit ? formatCurrency(card.creditLimit) : 'Nao configurado'}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3" style={cardTheme.panelStyle}>
                      <div
                        className="text-xs uppercase tracking-wide"
                        style={{ color: cardTheme.tertiaryTextColor }}
                      >
                        Usado
                      </div>
                      <div
                        className="mt-1 text-lg font-semibold"
                        style={{ color: cardTheme.primaryTextColor }}
                      >
                        {formatCurrency(usedLimit)}
                      </div>
                    </div>
                    <div className="rounded-lg border p-3" style={cardTheme.panelStyle}>
                      <div
                        className="text-xs uppercase tracking-wide"
                        style={{ color: cardTheme.tertiaryTextColor }}
                      >
                        Disponivel
                      </div>
                      <div
                        className="mt-1 text-lg font-semibold"
                        style={{
                          color:
                            availableLimit !== null && availableLimit < 0
                              ? '#FDBA74'
                              : cardTheme.primaryTextColor
                        }}
                      >
                        {availableLimit === null ? 'Nao configurado' : formatCurrency(availableLimit)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-xl border p-4" style={cardTheme.panelStyle}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div
                          className="text-sm font-medium"
                          style={{ color: cardTheme.primaryTextColor }}
                        >
                          Proxima fatura
                        </div>
                        {card.nextInvoice ? (
                          <div
                            className="mt-1 text-sm"
                            style={{ color: cardTheme.secondaryTextColor }}
                          >
                            {getInvoiceReferenceLabel(
                              card.nextInvoice.referenceYear,
                              card.nextInvoice.referenceMonth
                            )}
                          </div>
                        ) : (
                          <div
                            className="mt-1 text-sm"
                            style={{ color: cardTheme.secondaryTextColor }}
                          >
                            Nenhuma fatura em aberto
                          </div>
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
                          <div
                            className="text-xs uppercase tracking-wide"
                            style={{ color: cardTheme.tertiaryTextColor }}
                          >
                            Valor
                          </div>
                          <div
                            className="mt-1 text-lg font-semibold"
                            style={{ color: cardTheme.primaryTextColor }}
                          >
                            {formatCurrency(card.nextInvoice.totalAmount)}
                          </div>
                        </div>
                        <div>
                          <div
                            className="text-xs uppercase tracking-wide"
                            style={{ color: cardTheme.tertiaryTextColor }}
                          >
                            Vencimento
                          </div>
                          <div
                            className="mt-1 text-lg font-semibold"
                            style={{ color: cardTheme.primaryTextColor }}
                          >
                            {card.nextInvoice.dueDate
                              ? formatCalendarDate(card.nextInvoice.dueDate)
                              : '-'}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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
