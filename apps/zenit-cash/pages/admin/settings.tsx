import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Monitor,
  MessageCircle,
  Palette,
  RefreshCw,
  Save,
  Settings,
  ShieldAlert
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { ThemeSelector } from '@/components/ui/ThemeSelector';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { Input } from '@/components/ui/Input';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';

type FinancialResetPreview = {
  preserved: {
    accounts: number;
    creditCards: number;
    categories: number;
    fixedTemplates: number;
  };
  deleted: {
    transactions: number;
    creditCardPurchases: number;
    creditCardInvoices: number;
    fixedOccurrences: number;
    invoicePayments: number;
  };
  balances: {
    accountsToZero: number;
  };
  safeguards: {
    budgetsUnaffected: true;
  };
};

type WhatsAppBackendConfig = {
  cloudApiConfigured: boolean;
  webhookVerificationConfigured: boolean;
  signatureValidationConfigured: boolean;
  deepLinkConfigured: boolean;
  ready: boolean;
};

export default function SettingsPage() {
  const { currentTheme, availableThemes } = useTheme();
  const { companyName } = useAuth();
  const { canResetFinancialHistory } = usePermissions();
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  const currentThemeInfo = availableThemes.find((theme) => theme.key === currentTheme);

  const [resetPreview, setResetPreview] = useState<FinancialResetPreview | null>(null);
  const [resetPreviewLoading, setResetPreviewLoading] = useState(false);
  const [resetExecuting, setResetExecuting] = useState(false);
  const [resetConfirmationText, setResetConfirmationText] = useState('');
  const [resetAcknowledged, setResetAcknowledged] = useState(false);
  const [whatsappEnabled, setWhatsAppEnabled] = useState(false);
  const [whatsappLoading, setWhatsAppLoading] = useState(true);
  const [whatsappSaving, setWhatsAppSaving] = useState(false);
  const [whatsappBackendConfig, setWhatsAppBackendConfig] =
    useState<WhatsAppBackendConfig | null>(null);

  useEffect(() => {
    void loadWhatsAppChannel();
  }, []);

  async function loadWhatsAppChannel() {
    setWhatsAppLoading(true);

    try {
      const [entitlementsResponse, statusResponse] = await Promise.all([
        api.get('/app-access/company/entitlements'),
        api.get('/integrations/whatsapp/status')
      ]);

      const channelEntry = (entitlementsResponse.data || []).find(
        (item: { appKey: string; enabled: boolean }) => item.appKey === 'zenit-whatsapp'
      );

      setWhatsAppEnabled(Boolean(channelEntry?.enabled));
      setWhatsAppBackendConfig(statusResponse.data?.backendConfig || null);
    } catch (error: any) {
      addToast(
        error.response?.data?.error || 'Erro ao carregar configuracao do WhatsApp',
        'error'
      );
    } finally {
      setWhatsAppLoading(false);
    }
  }

  async function saveWhatsAppChannel() {
    setWhatsAppSaving(true);

    try {
      await api.put('/app-access/company/entitlements', {
        entitlements: [{ appKey: 'zenit-whatsapp', enabled: whatsappEnabled }]
      });

      addToast('Configuracao do WhatsApp atualizada com sucesso', 'success');
      await loadWhatsAppChannel();
    } catch (error: any) {
      addToast(
        error.response?.data?.error || 'Erro ao salvar configuracao do WhatsApp',
        'error'
      );
    } finally {
      setWhatsAppSaving(false);
    }
  }

  async function loadResetPreview() {
    setResetPreviewLoading(true);

    try {
      const response = await api.get('/financial/reset/preview');
      setResetPreview(response.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar previa do reset', 'error');
    } finally {
      setResetPreviewLoading(false);
    }
  }

  function handleExecuteReset() {
    if (!resetPreview) {
      addToast('Gere a previa do reset antes de continuar', 'error');
      return;
    }

    if (!resetAcknowledged || resetConfirmationText !== 'RESETAR') {
      addToast('Confirme a acao e digite RESETAR para continuar', 'error');
      return;
    }

    confirmation.confirm(
      {
        title: 'Executar reset financeiro',
        message: `O historico financeiro de ${companyName || 'empresa atual'} sera apagado e os saldos serao zerados. Esta acao nao pode ser desfeita pelo sistema.`,
        confirmText: 'Resetar Agora',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        setResetExecuting(true);

        try {
          await api.post('/financial/reset', {
            confirmationText: resetConfirmationText
          });

          addToast('Reset financeiro executado com sucesso', 'success');
          setResetAcknowledged(false);
          setResetConfirmationText('');
          await loadResetPreview();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao executar reset financeiro', 'error');
          throw error;
        } finally {
          setResetExecuting(false);
        }
      }
    );
  }

  const resetReady =
    Boolean(resetPreview) &&
    resetAcknowledged &&
    resetConfirmationText === 'RESETAR' &&
    !resetExecuting;

  return (
    <DashboardLayout title="Configuracoes">
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Administracao' },
          { label: 'Configuracoes' }
        ]}
      />

      <AccessGuard requiredRole="SUPERUSER">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-text">Configuracoes do Sistema</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-accent rounded-lg">
                <Palette size={20} className="text-on-accent" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">Personalizacao Visual</h2>
                <p className="text-sm text-text-muted">Customize a aparencia da interface</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3 text-text-muted">
                  Tema de Cores Atual
                </label>
                <div className="flex items-center gap-4 p-4 bg-background rounded-lg border border-border">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white shadow-lg"
                    style={{ backgroundColor: currentThemeInfo?.colors.primary }}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-text">{currentThemeInfo?.label}</div>
                    <div className="text-sm text-text-muted">{currentThemeInfo?.colors.primary}</div>
                  </div>
                  <ThemeSelector showLabel size="md" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-text-muted">
                  Preview das Cores
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-background rounded-lg border border-border">
                    <div className="text-xs text-text-muted mb-2">Cor Principal</div>
                    <div
                      className="w-full h-8 rounded border-2 border-white"
                      style={{ backgroundColor: currentThemeInfo?.colors.primary }}
                    />
                  </div>
                  <div className="p-3 bg-background rounded-lg border border-border">
                    <div className="text-xs text-text-muted mb-2">Hover</div>
                    <div
                      className="w-full h-8 rounded border-2 border-white"
                      style={{ backgroundColor: currentThemeInfo?.colors.primaryHover }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-text-muted">
                  Exemplos de Elementos
                </label>
                <div className="space-y-3">
                  <Button variant="accent" className="w-full">
                    Botao Principal
                  </Button>
                  <Button variant="outline" className="w-full">
                    Botao Secundario
                  </Button>
                  <div className="p-3 bg-background rounded-lg border border-accent">
                    <div className="text-accent font-medium">Card com Destaque</div>
                    <div className="text-text-muted text-sm">
                      Exemplo de card destacado com a cor do tema
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Settings size={20} className="text-on-solid" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text">Configuracoes Gerais</h2>
                <p className="text-sm text-text-muted">Configuracoes do sistema e preferencias</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3 text-text-muted">Interface</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                    <div>
                      <div className="text-text font-medium">Sidebar Colapsada</div>
                      <div className="text-sm text-text-muted">
                        Iniciar com menu lateral recolhido
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                    <div>
                      <div className="text-text font-medium">Animacoes</div>
                      <div className="text-sm text-text-muted">
                        Habilitar animacoes da interface
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3 text-text-muted">Notificacoes</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                    <div>
                      <div className="text-text font-medium">Notificacoes Push</div>
                      <div className="text-sm text-text-muted">
                        Receber notificacoes do sistema
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                    <div>
                      <div className="text-text font-medium">Email de Resumo</div>
                      <div className="text-sm text-text-muted">
                        Receber resumo semanal por email
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border">
                <Button variant="accent" className="w-full flex items-center gap-2">
                  <Save size={16} />
                  Salvar Configuracoes
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6 mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-green-600 rounded-lg">
              <MessageCircle size={20} className="text-on-solid" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text">Canal do WhatsApp</h2>
              <p className="text-sm text-text-muted">
                Habilite o canal para a empresa atual e permita que usuarios com grant
                conversem com o operador pelo WhatsApp.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4">
              <div>
                <div className="text-text font-medium">WhatsApp da empresa</div>
                <div className="text-sm text-text-muted">
                  O grant individual continua sendo controlado no cadastro de usuarios.
                </div>
              </div>
              <input
                checked={whatsappEnabled}
                className="w-4 h-4 text-accent bg-background border-border rounded focus:ring-accent"
                disabled={whatsappLoading || whatsappSaving}
                onChange={(event) => setWhatsAppEnabled(event.target.checked)}
                type="checkbox"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                  Cloud API
                </div>
                <div
                  className={
                    whatsappBackendConfig?.cloudApiConfigured
                      ? 'text-sm text-tone-green'
                      : 'text-sm text-tone-red'
                  }
                >
                  {whatsappBackendConfig?.cloudApiConfigured ? 'Configurada' : 'Pendente'}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                  Verificacao
                </div>
                <div
                  className={
                    whatsappBackendConfig?.webhookVerificationConfigured
                      ? 'text-sm text-tone-green'
                      : 'text-sm text-tone-red'
                  }
                >
                  {whatsappBackendConfig?.webhookVerificationConfigured
                    ? 'Verify token pronto'
                    : 'Verify token pendente'}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                  Assinatura
                </div>
                <div
                  className={
                    whatsappBackendConfig?.signatureValidationConfigured
                      ? 'text-sm text-tone-green'
                      : 'text-sm text-tone-red'
                  }
                >
                  {whatsappBackendConfig?.signatureValidationConfigured
                    ? 'App secret configurado'
                    : 'App secret pendente'}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-background p-4">
                <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                  QR / Deep Link
                </div>
                <div
                  className={
                    whatsappBackendConfig?.deepLinkConfigured
                      ? 'text-sm text-tone-green'
                      : 'text-sm text-tone-red'
                  }
                >
                  {whatsappBackendConfig?.deepLinkConfigured
                    ? 'Numero de destino pronto'
                    : 'Numero de destino pendente'}
                </div>
              </div>
            </div>

            {!whatsappBackendConfig?.ready && (
              <div className="rounded-lg border border-tone-yellow/25 bg-tone-yellow-soft p-4 text-sm text-tone-yellow">
                O backend ainda nao tem todas as variaveis necessarias para o canal.
                Ajuste os arquivos `.env` e o webhook da Meta antes de liberar o uso.
              </div>
            )}

            <div className="flex justify-end">
              <Button
                className="flex items-center gap-2"
                disabled={whatsappLoading || whatsappSaving}
                onClick={() => void saveWhatsAppChannel()}
                variant="accent"
              >
                <Save size={16} />
                {whatsappSaving ? 'Salvando...' : 'Salvar Canal do WhatsApp'}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 mt-6">
          <div className="flex items-center gap-3 mb-4">
            <Monitor size={20} className="text-accent" />
            <h3 className="text-lg font-medium text-text">Sobre os Temas</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-text mb-2">Recursos Disponiveis</h4>
              <ul className="text-sm text-text-muted space-y-1">
                <li>- {availableThemes.length} temas de cores diferentes</li>
                <li>- Mudanca em tempo real</li>
                <li>- Preferencia salva automaticamente</li>
                <li>- Cores aplicadas em toda a interface</li>
                <li>- Compativel com modo escuro</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-text mb-2">Acessibilidade</h4>
              <ul className="text-sm text-text-muted space-y-1">
                <li>- Contraste otimizado para leitura</li>
                <li>- Suporte a leitores de tela</li>
                <li>- Navegacao por teclado</li>
                <li>- Respeita preferencias de movimento</li>
                <li>- Cores testadas para daltonismo</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card className="p-6 mt-6 border border-tone-red/25">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-tone-red-soft border border-tone-red/25">
              <ShieldAlert size={20} className="text-tone-red" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text">Reset do Historico Financeiro</h3>
              <p className="text-sm text-text-muted">
                Mantem contas, categorias, cartoes e templates de fixas, mas apaga o
                historico financeiro da empresa atual e zera os saldos.
              </p>
            </div>
          </div>

          {!canResetFinancialHistory() ? (
            <div className="rounded-lg border border-tone-yellow/25 bg-tone-yellow-soft p-4 text-sm text-tone-yellow">
              Somente o company owner da empresa atual pode gerar a previa e executar este
              reset.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-tone-red/25 bg-tone-red-soft p-4 text-sm text-tone-red">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="mt-0.5 text-tone-red" />
                  <div>
                    <div className="font-medium">Acao irreversivel pelo sistema</div>
                    <div className="text-tone-red">
                      O reset remove lancamentos comuns, compras no cartao, pagamentos de
                      fatura e ocorrencias materializadas de contas fixas. Orcamentos nao sao
                      alterados.
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  onClick={() => void loadResetPreview()}
                  disabled={resetPreviewLoading || resetExecuting}
                  className="flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  {resetPreviewLoading ? 'Carregando previa...' : 'Gerar Previa do Reset'}
                </Button>
              </div>

              {resetPreview && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                        Estrutura Preservada
                      </div>
                      <div className="space-y-1 text-sm text-text">
                        <div>{resetPreview.preserved.accounts} contas</div>
                        <div>{resetPreview.preserved.creditCards} cartoes</div>
                        <div>{resetPreview.preserved.categories} categorias</div>
                        <div>{resetPreview.preserved.fixedTemplates} fixas</div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                        Historico Removido
                      </div>
                      <div className="space-y-1 text-sm text-text">
                        <div>{resetPreview.deleted.transactions} transacoes</div>
                        <div>{resetPreview.deleted.creditCardPurchases} compras no cartao</div>
                        <div>{resetPreview.deleted.creditCardInvoices} faturas</div>
                        <div>{resetPreview.deleted.invoicePayments} pagamentos de fatura</div>
                        <div>{resetPreview.deleted.fixedOccurrences} ocorrencias de fixas</div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background p-4">
                      <div className="text-xs uppercase tracking-wide text-text-muted mb-1">
                        Saldos
                      </div>
                      <div className="space-y-1 text-sm text-text">
                        <div>{resetPreview.balances.accountsToZero} contas/cartoes zerados</div>
                        <div className="text-text-muted">Sem transacao de ajuste</div>
                        <div className="text-text-muted">Orcamentos preservados</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border bg-elevated p-4">
                    <label className="flex items-start gap-3 text-sm text-text">
                      <input
                        type="checkbox"
                        checked={resetAcknowledged}
                        onChange={(event) => setResetAcknowledged(event.target.checked)}
                        disabled={resetExecuting}
                        className="mt-0.5 h-4 w-4 rounded border-border bg-background text-tone-red focus:ring-red-500"
                      />
                      <span>
                        Entendo que esta acao apaga o historico financeiro da empresa atual e
                        nao pode ser desfeita pelo sistema.
                      </span>
                    </label>

                    <div className="mt-4 max-w-sm">
                      <Input
                        label='Digite "RESETAR" para confirmar'
                        value={resetConfirmationText}
                        onChange={(event) => setResetConfirmationText(event.target.value)}
                        disabled={resetExecuting}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="danger"
                        onClick={handleExecuteReset}
                        disabled={!resetReady}
                        className="flex items-center gap-2"
                      >
                        <AlertTriangle size={16} />
                        {resetExecuting ? 'Resetando...' : 'Executar Reset'}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </Card>

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
      </AccessGuard>
    </DashboardLayout>
  );
}
