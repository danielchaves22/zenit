import React, { useState } from 'react';
import {
  AlertTriangle,
  Monitor,
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
          <h1 className="text-2xl font-semibold text-white">Configuracoes do Sistema</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-accent rounded-lg">
                <Palette size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Personalizacao Visual</h2>
                <p className="text-sm text-gray-400">Customize a aparencia da interface</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3 text-gray-300">
                  Tema de Cores Atual
                </label>
                <div className="flex items-center gap-4 p-4 bg-[#1e2126] rounded-lg border border-gray-700">
                  <div
                    className="w-8 h-8 rounded-full border-2 border-white shadow-lg"
                    style={{ backgroundColor: currentThemeInfo?.colors.primary }}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-white">{currentThemeInfo?.label}</div>
                    <div className="text-sm text-gray-400">{currentThemeInfo?.colors.primary}</div>
                  </div>
                  <ThemeSelector showLabel size="md" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-gray-300">
                  Preview das Cores
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-[#1e2126] rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">Cor Principal</div>
                    <div
                      className="w-full h-8 rounded border-2 border-white"
                      style={{ backgroundColor: currentThemeInfo?.colors.primary }}
                    />
                  </div>
                  <div className="p-3 bg-[#1e2126] rounded-lg border border-gray-700">
                    <div className="text-xs text-gray-400 mb-2">Hover</div>
                    <div
                      className="w-full h-8 rounded border-2 border-white"
                      style={{ backgroundColor: currentThemeInfo?.colors.primaryHover }}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-3 text-gray-300">
                  Exemplos de Elementos
                </label>
                <div className="space-y-3">
                  <Button variant="accent" className="w-full">
                    Botao Principal
                  </Button>
                  <Button variant="outline" className="w-full">
                    Botao Secundario
                  </Button>
                  <div className="p-3 bg-[#1e2126] rounded-lg border border-accent">
                    <div className="text-accent font-medium">Card com Destaque</div>
                    <div className="text-gray-400 text-sm">
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
                <Settings size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Configuracoes Gerais</h2>
                <p className="text-sm text-gray-400">Configuracoes do sistema e preferencias</p>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-3 text-gray-300">Interface</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                    <div>
                      <div className="text-white font-medium">Sidebar Colapsada</div>
                      <div className="text-sm text-gray-400">
                        Iniciar com menu lateral recolhido
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                    <div>
                      <div className="text-white font-medium">Animacoes</div>
                      <div className="text-sm text-gray-400">
                        Habilitar animacoes da interface
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-3 text-gray-300">Notificacoes</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                    <div>
                      <div className="text-white font-medium">Notificacoes Push</div>
                      <div className="text-sm text-gray-400">
                        Receber notificacoes do sistema
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                    <div>
                      <div className="text-white font-medium">Email de Resumo</div>
                      <div className="text-sm text-gray-400">
                        Receber resumo semanal por email
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-700">
                <Button variant="accent" className="w-full flex items-center gap-2">
                  <Save size={16} />
                  Salvar Configuracoes
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-6 mt-6">
          <div className="flex items-center gap-3 mb-4">
            <Monitor size={20} className="text-accent" />
            <h3 className="text-lg font-medium text-white">Sobre os Temas</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-white mb-2">Recursos Disponiveis</h4>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>- {availableThemes.length} temas de cores diferentes</li>
                <li>- Mudanca em tempo real</li>
                <li>- Preferencia salva automaticamente</li>
                <li>- Cores aplicadas em toda a interface</li>
                <li>- Compativel com modo escuro</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-white mb-2">Acessibilidade</h4>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>- Contraste otimizado para leitura</li>
                <li>- Suporte a leitores de tela</li>
                <li>- Navegacao por teclado</li>
                <li>- Respeita preferencias de movimento</li>
                <li>- Cores testadas para daltonismo</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card className="p-6 mt-6 border border-red-800/60">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-red-900/30 border border-red-700/60">
              <ShieldAlert size={20} className="text-red-300" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Reset do Historico Financeiro</h3>
              <p className="text-sm text-gray-400">
                Mantem contas, categorias, cartoes e templates de fixas, mas apaga o
                historico financeiro da empresa atual e zera os saldos.
              </p>
            </div>
          </div>

          {!canResetFinancialHistory() ? (
            <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/10 p-4 text-sm text-yellow-100">
              Somente o company owner da empresa atual pode gerar a previa e executar este
              reset.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-lg border border-red-700/40 bg-red-900/10 p-4 text-sm text-red-100">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="mt-0.5 text-red-300" />
                  <div>
                    <div className="font-medium">Acao irreversivel pelo sistema</div>
                    <div className="text-red-100/80">
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
                    <div className="rounded-lg border border-gray-700 bg-[#1e2126] p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                        Estrutura Preservada
                      </div>
                      <div className="space-y-1 text-sm text-white">
                        <div>{resetPreview.preserved.accounts} contas</div>
                        <div>{resetPreview.preserved.creditCards} cartoes</div>
                        <div>{resetPreview.preserved.categories} categorias</div>
                        <div>{resetPreview.preserved.fixedTemplates} fixas</div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-700 bg-[#1e2126] p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                        Historico Removido
                      </div>
                      <div className="space-y-1 text-sm text-white">
                        <div>{resetPreview.deleted.transactions} transacoes</div>
                        <div>{resetPreview.deleted.creditCardPurchases} compras no cartao</div>
                        <div>{resetPreview.deleted.creditCardInvoices} faturas</div>
                        <div>{resetPreview.deleted.invoicePayments} pagamentos de fatura</div>
                        <div>{resetPreview.deleted.fixedOccurrences} ocorrencias de fixas</div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-gray-700 bg-[#1e2126] p-4">
                      <div className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                        Saldos
                      </div>
                      <div className="space-y-1 text-sm text-white">
                        <div>{resetPreview.balances.accountsToZero} contas/cartoes zerados</div>
                        <div className="text-gray-400">Sem transacao de ajuste</div>
                        <div className="text-gray-400">Orcamentos preservados</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-700 bg-[#161a20] p-4">
                    <label className="flex items-start gap-3 text-sm text-gray-200">
                      <input
                        type="checkbox"
                        checked={resetAcknowledged}
                        onChange={(event) => setResetAcknowledged(event.target.checked)}
                        disabled={resetExecuting}
                        className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-[#1e2126] text-red-500 focus:ring-red-500"
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
