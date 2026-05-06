import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AlertTriangle, ArrowLeft, HelpCircle, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

type AccountType = 'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'CASH';

interface Account {
  id: number;
  name: string;
  type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'INVESTMENT' | 'CASH';
  balance: string;
  accountNumber?: string;
  bankName?: string;
  isActive: boolean;
  isDefault: boolean;
  allowNegativeBalance: boolean;
}

interface AccountFormProps {
  mode: 'create' | 'edit';
  accountId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

function formatCurrency(value: string | number): string {
  const numericValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isNaN(numericValue) ? 0 : numericValue);
}

export default function AccountForm({
  mode,
  accountId,
  onSuccess,
  onCancel
}: AccountFormProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [existingAccount, setExistingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'CHECKING' as AccountType,
    initialBalance: '0.00',
    accountNumber: '',
    bankName: '',
    isActive: true,
    allowNegativeBalance: false
  });

  useEffect(() => {
    if (mode === 'edit' && accountId) {
      void fetchAccount();
    }
  }, [accountId, mode]);

  async function fetchAccount() {
    try {
      const response = await api.get(`/financial/accounts/${accountId}`);
      const account = response.data as Account;

      if (account.type === 'CREDIT_CARD') {
        addToast('Esta tela é destinada apenas a contas financeiras. Use a área de cartões.', 'error');
        handleCancel();
        return;
      }

      setExistingAccount(account);
      setFormData({
        name: account.name,
        type: account.type as AccountType,
        initialBalance: account.balance,
        accountNumber: account.accountNumber || '',
        bankName: account.bankName || '',
        isActive: account.isActive,
        allowNegativeBalance: account.allowNegativeBalance
      });
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar conta', 'error');
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

    router.push('/financial/accounts');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!formData.name.trim()) {
      addToast('Nome da conta é obrigatório', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        accountNumber: formData.accountNumber || null,
        bankName: formData.bankName || null,
        isActive: formData.isActive,
        allowNegativeBalance: formData.allowNegativeBalance,
        ...(mode === 'create' ? { initialBalance: formData.initialBalance } : {})
      };

      if (mode === 'create') {
        await api.post('/financial/accounts', payload);
        addToast('Conta criada com sucesso', 'success');
      } else {
        await api.put(`/financial/accounts/${accountId}`, payload);
        addToast('Conta atualizada com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/financial/accounts');
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error;
      if (errorMessage?.includes('saldo negativo')) {
        addToast(
          'Não é possível desabilitar saldo negativo. Esta conta tem saldo negativo.',
          'error'
        );
      } else {
        addToast(errorMessage || 'Erro ao salvar conta', 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader message="Carregando conta..." />;
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
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
            {mode === 'create' ? 'Nova Conta Financeira' : 'Editar Conta Financeira'}
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
            form="account-form"
            variant="accent"
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving
              ? 'Salvando...'
              : mode === 'create'
                ? 'Criar Conta'
                : 'Salvar Alterações'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.7fr)_340px]">
        <Card>
          <form id="account-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Nome da Conta"
                value={formData.name}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, name: event.target.value }))
                }
                required
                placeholder="Ex: Conta Corrente Banco ABC"
                disabled={saving}
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">
                  Tipo de Conta
                </label>
                <select
                  value={formData.type}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      type: event.target.value as AccountType
                    }))
                  }
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  disabled={saving}
                >
                  <option value="CHECKING">Conta Corrente</option>
                  <option value="SAVINGS">Poupança</option>
                  <option value="INVESTMENT">Investimento</option>
                  <option value="CASH">Dinheiro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {mode === 'create' && (
                <CurrencyInput
                  label="Saldo Inicial"
                  value={formData.initialBalance}
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, initialBalance: value }))
                  }
                  disabled={saving}
                />
              )}

              <Input
                label="Número da Conta (opcional)"
                value={formData.accountNumber}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, accountNumber: event.target.value }))
                }
                placeholder="Ex: 12345-6"
                disabled={saving}
              />

              <Input
                label="Banco (opcional)"
                value={formData.bankName}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, bankName: event.target.value }))
                }
                placeholder="Ex: Banco do Brasil"
                disabled={saving}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  id="account-is-active"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, isActive: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-gray-700 bg-[#1e2126] text-accent focus:ring-accent"
                  disabled={saving}
                />
                <label htmlFor="account-is-active" className="text-sm text-gray-300">
                  Conta ativa
                </label>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="allow-negative-balance"
                  type="checkbox"
                  checked={formData.allowNegativeBalance}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      allowNegativeBalance: event.target.checked
                    }))
                  }
                  className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-[#1e2126] text-accent focus:ring-accent"
                  disabled={saving}
                />
                <div className="flex-1">
                  <label
                    htmlFor="allow-negative-balance"
                    className="cursor-pointer text-sm text-gray-300"
                  >
                    Permitir saldo negativo
                  </label>
                  <div className="mt-1 flex items-center gap-1">
                    <HelpCircle size={12} className="text-gray-400" />
                    <span className="text-xs text-gray-400">
                      Permite que a conta fique negativa, como em cheque especial.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </Card>

        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Resumo</div>
              <div className="mt-1 text-sm text-gray-400">
                {mode === 'create'
                  ? 'A conta será criada pronta para uso em lançamentos e relatórios.'
                  : 'Ajustes de saldo e conta padrão continuam disponíveis na listagem.'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Tipo</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formData.type === 'CHECKING'
                  ? 'Conta Corrente'
                  : formData.type === 'SAVINGS'
                    ? 'Poupança'
                    : formData.type === 'INVESTMENT'
                      ? 'Investimento'
                      : 'Dinheiro'}
              </div>
            </div>

            {mode === 'create' ? (
              <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Saldo inicial</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {formatCurrency(formData.initialBalance)}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Saldo atual</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {existingAccount ? formatCurrency(existingAccount.balance) : '-'}
                </div>
              </div>
            )}

            {mode === 'edit' && formData.allowNegativeBalance && (
              <div className="rounded-lg border border-blue-700/60 bg-blue-900/20 p-4 text-sm text-blue-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5" />
                  <span>Esta conta aceita saldo negativo autorizado.</span>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
