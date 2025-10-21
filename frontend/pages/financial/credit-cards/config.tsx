// frontend/pages/financial/credit-cards/config.tsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useToast } from '@/components/ui/ToastContext';
import { PageGuard } from '@/components/ui/AccessGuard';
import { ArrowLeft, Save, CreditCard, DollarSign, Calendar, Bell } from 'lucide-react';
import api from '@/lib/api';

interface Account {
  id: number;
  name: string;
  type: string;
}

interface CreditCardConfig {
  id: number;
  financialAccountId: number;
  creditLimit: string;
  usedLimit: string;
  availableLimit: string;
  closingDay: number;
  dueDay: number;
  dueDaysAfterClosing: number;
  annualFee: string | null;
  annualFeeMonthlyCharge: string | null;
  interestRate: string | null;
  latePaymentFee: string | null;
  minimumPaymentPercent: string;
  alertLimitPercent: string;
  enableLimitAlerts: boolean;
  enableDueAlerts: boolean;
  dueDaysBeforeAlert: number;
  isActive: boolean;
}

function CreditCardConfigPageInner() {
  const router = useRouter();
  const { addToast } = useToast();
  const { accountId } = router.query;

  const [account, setAccount] = useState<Account | null>(null);
  const [config, setConfig] = useState<CreditCardConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'create' | 'edit'>('create');

  const [formData, setFormData] = useState({
    creditLimit: '',
    closingDay: 5,
    dueDay: 15,
    dueDaysAfterClosing: 10,
    annualFee: '',
    annualFeeMonthlyCharge: '',
    interestRate: '',
    latePaymentFee: '',
    minimumPaymentPercent: '10',
    alertLimitPercent: '80',
    enableLimitAlerts: true,
    enableDueAlerts: true,
    dueDaysBeforeAlert: 3
  });

  useEffect(() => {
    if (accountId) {
      fetchAccountAndConfig();
    }
  }, [accountId]);

  async function fetchAccountAndConfig() {
    if (!accountId) return;

    setLoading(true);
    try {
      // Buscar dados da conta
      const accountResponse = await api.get(`/financial/accounts/${accountId}`);
      setAccount(accountResponse.data);

      if (accountResponse.data.type !== 'CREDIT_CARD') {
        addToast('Esta conta não é do tipo Cartão de Crédito', 'error');
        router.push('/financial/accounts');
        return;
      }

      // Tentar buscar configuração existente
      try {
        const configResponse = await api.get(`/financial/accounts/${accountId}/credit-card/config`);
        setConfig(configResponse.data);
        setMode('edit');

        // Preencher formulário com dados existentes
        setFormData({
          creditLimit: configResponse.data.creditLimit,
          closingDay: configResponse.data.closingDay,
          dueDay: configResponse.data.dueDay,
          dueDaysAfterClosing: configResponse.data.dueDaysAfterClosing,
          annualFee: configResponse.data.annualFee || '',
          annualFeeMonthlyCharge: configResponse.data.annualFeeMonthlyCharge || '',
          interestRate: configResponse.data.interestRate || '',
          latePaymentFee: configResponse.data.latePaymentFee || '',
          minimumPaymentPercent: configResponse.data.minimumPaymentPercent,
          alertLimitPercent: configResponse.data.alertLimitPercent,
          enableLimitAlerts: configResponse.data.enableLimitAlerts,
          enableDueAlerts: configResponse.data.enableDueAlerts,
          dueDaysBeforeAlert: configResponse.data.dueDaysBeforeAlert
        });
      } catch (err: any) {
        if (err.response?.status === 404) {
          setMode('create');
        } else {
          throw err;
        }
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!accountId) return;

    setSaving(true);
    try {
      if (mode === 'create') {
        await api.post(`/financial/accounts/${accountId}/credit-card/config`, formData);
        addToast('Configuração de cartão criada com sucesso', 'success');
      } else {
        await api.put(`/financial/accounts/${accountId}/credit-card/config`, formData);
        addToast('Configuração de cartão atualizada com sucesso', 'success');
      }

      router.push('/financial/credit-cards');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar configuração', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleChange(field: string, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-text-secondary">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Breadcrumb
        items={[
          { label: 'Financeiro', href: '/financial' },
          { label: 'Cartões de Crédito', href: '/financial/credit-cards' },
          { label: mode === 'create' ? 'Configurar Cartão' : 'Editar Configuração' }
        ]}
      />

      <div className="mt-6 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => router.back()}
            className="p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-text">
              {mode === 'create' ? 'Configurar Cartão de Crédito' : 'Editar Configuração'}
            </h1>
            {account && (
              <p className="text-sm text-text-secondary mt-1">
                Cartão: {account.name}
              </p>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Limite de Crédito */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text">Limite de Crédito</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Limite Total *
                  </label>
                  <CurrencyInput
                    value={formData.creditLimit}
                    onChange={(value) => handleChange('creditLimit', value)}
                    required
                  />
                </div>

                {mode === 'edit' && config && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text mb-2">
                        Limite Disponível
                      </label>
                      <Input
                        value={`R$ ${parseFloat(config.availableLimit).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        disabled
                        className="bg-surface-dark"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </Card>

          {/* Ciclo de Faturamento */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text">Ciclo de Faturamento</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Dia do Fechamento *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.closingDay}
                    onChange={(e) => handleChange('closingDay', parseInt(e.target.value))}
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Dia do mês que a fatura fecha (1-31)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Dia do Vencimento *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.dueDay}
                    onChange={(e) => handleChange('dueDay', parseInt(e.target.value))}
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Dia do vencimento da fatura (1-31)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Dias entre Fechamento e Vencimento
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={formData.dueDaysAfterClosing}
                    onChange={(e) => handleChange('dueDaysAfterClosing', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Padrão: 10 dias
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Taxas e Juros */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text">Taxas e Juros</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Anuidade Total
                  </label>
                  <CurrencyInput
                    value={formData.annualFee}
                    onChange={(value) => handleChange('annualFee', value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Anuidade Mensal
                  </label>
                  <CurrencyInput
                    value={formData.annualFeeMonthlyCharge}
                    onChange={(value) => handleChange('annualFeeMonthlyCharge', value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Taxa de Juros (% ao mês)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.interestRate}
                    onChange={(e) => handleChange('interestRate', e.target.value)}
                    placeholder="Ex: 10.50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Multa por Atraso
                  </label>
                  <CurrencyInput
                    value={formData.latePaymentFee}
                    onChange={(value) => handleChange('latePaymentFee', value)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Pagamento Mínimo (%)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.minimumPaymentPercent}
                    onChange={(e) => handleChange('minimumPaymentPercent', e.target.value)}
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    % do valor total da fatura
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Alertas */}
          <Card>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-text">Alertas e Notificações</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-text">
                      Alertas de Limite
                    </label>
                    <p className="text-xs text-text-secondary">
                      Notificar quando o limite usado atingir o percentual configurado
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableLimitAlerts}
                    onChange={(e) => handleChange('enableLimitAlerts', e.target.checked)}
                    className="w-4 h-4"
                  />
                </div>

                {formData.enableLimitAlerts && (
                  <div>
                    <label className="block text-sm font-medium text-text mb-2">
                      Alertar ao atingir (%)
                    </label>
                    <Input
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={formData.alertLimitPercent}
                      onChange={(e) => handleChange('alertLimitPercent', e.target.value)}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-text">
                      Alertas de Vencimento
                    </label>
                    <p className="text-xs text-text-secondary">
                      Notificar antes da data de vencimento da fatura
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableDueAlerts}
                    onChange={(e) => handleChange('enableDueAlerts', e.target.checked)}
                    className="w-4 h-4"
                  />
                </div>

                {formData.enableDueAlerts && (
                  <div>
                    <label className="block text-sm font-medium text-text mb-2">
                      Alertar com quantos dias de antecedência
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="15"
                      value={formData.dueDaysBeforeAlert}
                      onChange={(e) => handleChange('dueDaysBeforeAlert', parseInt(e.target.value))}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Botões de Ação */}
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.back()}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Salvando...' : mode === 'create' ? 'Criar Configuração' : 'Salvar Alterações'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function CreditCardConfigPage() {
  return (
    <PageGuard requiredPermissions={[]}>
      <DashboardLayout>
        <CreditCardConfigPageInner />
      </DashboardLayout>
    </PageGuard>
  );
}
