import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { useToast } from '@/components/ui/ToastContext';
import { ArrowLeft, CreditCard, Save, X } from 'lucide-react';
import api from '@/lib/api';
import { getAvailableCreditLimit, getUsedCreditLimit } from '@/utils/creditCards';

interface CreditCardAccount {
  id: number;
  name: string;
  balance: string;
  bankName?: string | null;
  accountNumber?: string | null;
  creditLimit?: string | null;
  statementClosingDay?: number | null;
  statementDueDay?: number | null;
  isActive: boolean;
}

interface CreditCardFormProps {
  mode: 'create' | 'edit';
  cardId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

export default function CreditCardForm({
  mode,
  cardId,
  onSuccess,
  onCancel
}: CreditCardFormProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [existingCard, setExistingCard] = useState<CreditCardAccount | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    bankName: '',
    accountNumber: '',
    creditLimit: '',
    statementClosingDay: '',
    statementDueDay: '',
    isActive: true
  });

  useEffect(() => {
    if (mode === 'edit' && cardId) {
      void fetchCard();
    }
  }, [cardId, mode]);

  async function fetchCard() {
    try {
      const response = await api.get(`/financial/accounts/${cardId}`);
      const card = response.data as CreditCardAccount & { type: string };

      if (card.type !== 'CREDIT_CARD') {
        addToast('A conta selecionada não é um cartão de crédito', 'error');
        handleCancel();
        return;
      }

      setExistingCard(card);
      setFormData({
        name: card.name,
        bankName: card.bankName || '',
        accountNumber: card.accountNumber || '',
        creditLimit: card.creditLimit || '',
        statementClosingDay: card.statementClosingDay?.toString() || '',
        statementDueDay: card.statementDueDay?.toString() || '',
        isActive: card.isActive
      });
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar cartão', 'error');
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.push('/financial/credit-cards');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!formData.name.trim()) {
      addToast('Nome do cartão é obrigatório', 'error');
      return;
    }

    if (!formData.creditLimit) {
      addToast('Limite do cartão é obrigatório', 'error');
      return;
    }

    if (!formData.statementClosingDay || !formData.statementDueDay) {
      addToast('Dia de fechamento e vencimento são obrigatórios', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: formData.name,
        type: 'CREDIT_CARD',
        bankName: formData.bankName || null,
        accountNumber: formData.accountNumber || null,
        isActive: formData.isActive,
        allowNegativeBalance: true,
        creditLimit: parseFloat(formData.creditLimit),
        statementClosingDay: Number(formData.statementClosingDay),
        statementDueDay: Number(formData.statementDueDay)
      };

      if (mode === 'create') {
        await api.post('/financial/accounts', {
          ...payload,
          initialBalance: '0.00'
        });
        addToast('Cartão criado com sucesso', 'success');
      } else {
        await api.put(`/financial/accounts/${cardId}`, payload);
        addToast('Cartão atualizado com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/financial/credit-cards');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar cartão', 'error');
    } finally {
      setSaving(false);
    }
  }

  const availableLimit = existingCard ? getAvailableCreditLimit(existingCard) : null;
  const usedLimit = existingCard ? getUsedCreditLimit(existingCard) : 0;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex items-center gap-2"
            disabled={saving}
          >
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <h1 className="text-2xl font-semibold text-white">
            {mode === 'create' ? 'Novo Cartão' : 'Editar Cartão'}
          </h1>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <X size={16} />
            Cancelar
          </Button>
          <Button
            type="submit"
            form="credit-card-form"
            variant="accent"
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar Cartão' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <div className="h-80 animate-pulse rounded bg-[#1b212c]" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_360px]">
          <Card>
            <form id="credit-card-form" onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-xl border border-purple-700/50 bg-purple-950/20 p-4">
                <div className="flex items-start gap-3">
                  <CreditCard size={18} className="mt-0.5 text-purple-300" />
                  <div>
                    <div className="font-medium text-white">Configuração do cartão</div>
                    <div className="mt-1 text-sm text-gray-300">
                      O cartão usa limite, fechamento e vencimento para gerar as faturas.
                      O pagamento da fatura continua sendo feito na área de Cartões e Faturas.
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Nome do Cartão"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  required
                  disabled={saving}
                  placeholder="Ex: Cartão Empresa Visa"
                />
                <Input
                  label="Banco (opcional)"
                  value={formData.bankName}
                  onChange={(event) => setFormData({ ...formData, bankName: event.target.value })}
                  disabled={saving}
                  placeholder="Ex: Itau"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="Número do Cartão (opcional)"
                  value={formData.accountNumber}
                  onChange={(event) => setFormData({ ...formData, accountNumber: event.target.value })}
                  disabled={saving}
                  placeholder="Ex: final 1234"
                />
                <CurrencyInput
                  label="Limite do Cartão *"
                  value={formData.creditLimit}
                  onChange={(value) => setFormData({ ...formData, creditLimit: value })}
                  disabled={saving}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Fechamento *"
                    type="number"
                    min="1"
                    max="31"
                    value={formData.statementClosingDay}
                    onChange={(event) =>
                      setFormData({ ...formData, statementClosingDay: event.target.value })
                    }
                    disabled={saving}
                  />
                  <Input
                    label="Vencimento *"
                    type="number"
                    min="1"
                    max="31"
                    value={formData.statementDueDay}
                    onChange={(event) =>
                      setFormData({ ...formData, statementDueDay: event.target.value })
                    }
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="credit-card-is-active"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(event) =>
                    setFormData({ ...formData, isActive: event.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-700 bg-[#1e2126] text-accent focus:ring-accent"
                  disabled={saving}
                />
                <label htmlFor="credit-card-is-active" className="text-sm text-gray-300">
                  Cartão ativo
                </label>
              </div>
            </form>
          </Card>

          <Card>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-white">Resumo do cartão</div>
                <div className="mt-1 text-sm text-gray-400">
                  {mode === 'create'
                    ? 'O cartão será criado pronto para compras e acompanhamento de faturas.'
                    : 'Resumo do limite e do saldo atual do cartão.'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Limite configurado</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {formData.creditLimit ? formatCurrency(formData.creditLimit) : 'Não informado'}
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Ciclo</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {formData.statementClosingDay || '-'} / {formData.statementDueDay || '-'}
                </div>
                <div className="mt-1 text-xs text-gray-400">Fechamento / vencimento</div>
              </div>

              {existingCard && (
                <>
                  <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Limite usado</div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {formatCurrency(usedLimit)}
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-400">Limite disponível</div>
                    <div className={`mt-2 text-xl font-semibold ${availableLimit !== null && availableLimit < 0 ? 'text-orange-300' : 'text-white'}`}>
                      {availableLimit === null ? 'Não configurado' : formatCurrency(availableLimit)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
