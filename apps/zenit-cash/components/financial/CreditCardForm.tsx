import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, CreditCard, Save, X } from 'lucide-react';
import BankLogo from '@/components/financial/BankLogo';
import BankSelect from '@/components/financial/BankSelect';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import {
  FinancialBank,
  findBankByLegacyFields,
  getBankBySelectValue,
  getBankDisplayName
} from '@/utils/banks';
import {
  DEFAULT_CREDIT_CARD_COLOR,
  getCreditCardTheme,
  normalizeHexColor
} from '@/utils/creditCardAppearance';
import { getAvailableCreditLimit, getUsedCreditLimit } from '@/utils/creditCards';

interface CreditCardAccount {
  id: number;
  name: string;
  type: string;
  balance: string;
  bankId?: number | null;
  bankName?: string | null;
  bankCode?: string | null;
  accountNumber?: string | null;
  creditLimit?: string | null;
  cardColor?: string | null;
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

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [banks, setBanks] = useState<FinancialBank[]>([]);
  const [existingCard, setExistingCard] = useState<CreditCardAccount | null>(null);
  const [legacyBankHint, setLegacyBankHint] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    bankId: '',
    accountNumber: '',
    creditLimit: '',
    cardColor: DEFAULT_CREDIT_CARD_COLOR,
    statementClosingDay: '',
    statementDueDay: '',
    isActive: true
  });

  useEffect(() => {
    void initializeForm();
  }, [cardId, mode]);

  const selectedBank = useMemo(
    () => getBankBySelectValue(banks, formData.bankId),
    [banks, formData.bankId]
  );

  async function initializeForm() {
    setLoading(true);

    try {
      const requests: Promise<any>[] = [api.get('/financial/banks')];

      if (mode === 'edit' && cardId) {
        requests.push(api.get(`/financial/accounts/${cardId}`));
      }

      const [banksResponse, cardResponse] = await Promise.all(requests);
      const availableBanks = (banksResponse.data || []) as FinancialBank[];

      setBanks(availableBanks);

      if (mode === 'edit' && cardId) {
        const card = cardResponse?.data as CreditCardAccount;

        if (card.type !== 'CREDIT_CARD') {
          addToast('A conta selecionada nao e um cartao de credito', 'error');
          handleCancel();
          return;
        }

        const matchedBank = findBankByLegacyFields(
          availableBanks,
          card.bankId,
          card.bankCode,
          card.bankName
        );

        setExistingCard(card);
        setLegacyBankHint(card.bankName && !matchedBank ? card.bankName : null);
        setFormData({
          name: card.name,
          bankId: matchedBank ? String(matchedBank.id) : '',
          accountNumber: card.accountNumber || '',
          creditLimit: card.creditLimit || '',
          cardColor: normalizeHexColor(card.cardColor),
          statementClosingDay: card.statementClosingDay?.toString() || '',
          statementDueDay: card.statementDueDay?.toString() || '',
          isActive: card.isActive
        });
      } else {
        setExistingCard(null);
        setLegacyBankHint(null);
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar configuracao do cartao', 'error');
      if (mode === 'edit') {
        handleCancel();
      }
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
      addToast('Nome do cartao e obrigatorio', 'error');
      return;
    }

    if (!formData.creditLimit) {
      addToast('Limite do cartao e obrigatorio', 'error');
      return;
    }

    if (!formData.statementClosingDay || !formData.statementDueDay) {
      addToast('Dia de fechamento e vencimento sao obrigatorios', 'error');
      return;
    }

    if (!/^#[0-9A-Fa-f]{6}$/.test(formData.cardColor.trim())) {
      addToast('Informe uma cor valida no formato #RRGGBB', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: formData.name.trim(),
        type: 'CREDIT_CARD',
        bankId: formData.bankId ? Number(formData.bankId) : null,
        bankName: null,
        bankCode: null,
        accountNumber: formData.accountNumber.trim() || null,
        isActive: formData.isActive,
        allowNegativeBalance: true,
        creditLimit: parseFloat(formData.creditLimit),
        cardColor: normalizeHexColor(formData.cardColor),
        statementClosingDay: Number(formData.statementClosingDay),
        statementDueDay: Number(formData.statementDueDay)
      };

      if (mode === 'create') {
        await api.post('/financial/accounts', {
          ...payload,
          initialBalance: '0.00'
        });
        addToast('Cartao criado com sucesso', 'success');
      } else {
        await api.put(`/financial/accounts/${cardId}`, payload);
        addToast('Cartao atualizado com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/financial/credit-cards');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar cartao', 'error');
    } finally {
      setSaving(false);
    }
  }

  const availableLimit = existingCard ? getAvailableCreditLimit(existingCard) : null;
  const usedLimit = existingCard ? getUsedCreditLimit(existingCard) : 0;
  const selectedBankName =
    getBankDisplayName(selectedBank, legacyBankHint) || 'Banco emissor';
  const cardTheme = getCreditCardTheme(formData.cardColor);

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
            {mode === 'create' ? 'Novo Cartao' : 'Editar Cartao'}
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
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar Cartao' : 'Salvar alteracoes'}
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
                    <div className="font-medium text-white">Configuracao do cartao</div>
                    <div className="mt-1 text-sm text-gray-300">
                      O cartao usa limite, fechamento e vencimento para gerar as faturas.
                      O pagamento da fatura continua sendo feito na area de Cartoes e Faturas.
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Nome do cartao"
                  value={formData.name}
                  onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  required
                  disabled={saving}
                  placeholder="Ex: Cartao Empresa Visa"
                />
                <BankSelect
                  label="Banco emissor"
                  banks={banks}
                  value={formData.bankId}
                  onChange={(bankId) => {
                    setLegacyBankHint(null);
                    setFormData((previous) => ({ ...previous, bankId }));
                  }}
                  disabled={saving}
                  placeholder={banks.length === 0 ? 'Nenhum banco cadastrado' : 'Selecione um banco'}
                />
              </div>

              {legacyBankHint && !selectedBank && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
                  O cartao estava vinculado ao banco legado "{legacyBankHint}". Selecione um banco
                  do catalogo para atualizar esse vinculo.
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input
                  label="Numero do cartao (opcional)"
                  value={formData.accountNumber}
                  onChange={(event) =>
                    setFormData({ ...formData, accountNumber: event.target.value })
                  }
                  disabled={saving}
                  placeholder="Ex: final 1234"
                />
                <CurrencyInput
                  label="Limite do cartao *"
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

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Cor do cartao</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.cardColor}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        cardColor: normalizeHexColor(event.target.value)
                      })
                    }
                    className="h-10 w-12 cursor-pointer rounded border border-gray-700"
                    disabled={saving}
                  />
                  <Input
                    value={formData.cardColor}
                    onChange={(event) =>
                      setFormData({
                        ...formData,
                        cardColor: event.target.value.toUpperCase()
                      })
                    }
                    placeholder="#1D4ED8"
                    className="mb-0 flex-1"
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
                  Cartao ativo
                </label>
              </div>
            </form>
          </Card>

          <Card>
            <div className="space-y-4">
              <div>
                <div className="text-sm font-medium text-white">Resumo do cartao</div>
                <div className="mt-1 text-sm text-gray-400">
                  {mode === 'create'
                    ? 'O cartao sera criado pronto para compras e acompanhamento de faturas.'
                    : 'Resumo do limite e do saldo atual do cartao.'}
                </div>
              </div>

              <div className="rounded-2xl border p-4" style={cardTheme.cardStyle}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <BankLogo bank={selectedBank} bankName={selectedBankName} size="lg" className="border-white/20" />
                    <div>
                      <div
                        className="text-base font-semibold"
                        style={{ color: cardTheme.primaryTextColor }}
                      >
                        {formData.name.trim() || 'Nome do cartao'}
                      </div>
                      <div
                        className="mt-1 text-sm"
                        style={{ color: cardTheme.secondaryTextColor }}
                      >
                        {selectedBankName}
                      </div>
                    </div>
                  </div>
                  <div
                    className="text-xs font-semibold uppercase tracking-[0.18em]"
                    style={{ color: cardTheme.tertiaryTextColor }}
                  >
                    Cartao
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div style={{ color: cardTheme.tertiaryTextColor }}>Limite</div>
                    <div
                      className="mt-1 text-base font-semibold"
                      style={{ color: cardTheme.primaryTextColor }}
                    >
                      {formData.creditLimit ? formatCurrency(formData.creditLimit) : 'Nao informado'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: cardTheme.tertiaryTextColor }}>Ciclo</div>
                    <div
                      className="mt-1 text-base font-semibold"
                      style={{ color: cardTheme.primaryTextColor }}
                    >
                      {formData.statementClosingDay || '-'} / {formData.statementDueDay || '-'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Limite configurado</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {formData.creditLimit ? formatCurrency(formData.creditLimit) : 'Nao informado'}
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
                    <div className="text-xs uppercase tracking-wide text-gray-400">Limite disponivel</div>
                    <div
                      className={`mt-2 text-xl font-semibold ${
                        availableLimit !== null && availableLimit < 0
                          ? 'text-orange-300'
                          : 'text-white'
                      }`}
                    >
                      {availableLimit === null ? 'Nao configurado' : formatCurrency(availableLimit)}
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
