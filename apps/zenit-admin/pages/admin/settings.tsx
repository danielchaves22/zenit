// frontend/pages/admin/settings.tsx - PÁGINA DE CONFIGURAÇÕES COM PROTEÇÃO
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { AccessGuard } from '@/components/ui/AccessGuard'; // ✅ NOVO IMPORT
import { ThemeSelector } from '@/components/ui/ThemeSelector';
import { useTheme } from '@/contexts/ThemeContext';
import { usePermissions } from '@/hooks/usePermissions'; // ✅ NOVO IMPORT
import { Palette, Settings, Monitor, Smartphone, Save } from 'lucide-react';

export default function SettingsPage() {
  const { currentTheme, availableThemes } = useTheme();
  const { canAccessSettings } = usePermissions(); // ✅ USAR HOOK DE PERMISSÕES
  const currentThemeInfo = availableThemes.find(t => t.key === currentTheme);

  return (
    <DashboardLayout title="Configurações">
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Administração' },
        { label: 'Configurações' }
      ]} />

      {/* ✅ PROTEÇÃO DE ACESSO - APENAS SUPERUSER E ADMIN */}
      <AccessGuard requiredRole="SUPERUSER">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Configurações do Sistema</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configurações de Tema */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-accent rounded-lg">
                <Palette size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Personalização Visual</h2>
                <p className="text-sm text-gray-400">Customize a aparência da interface</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Tema Atual */}
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
                  <ThemeSelector showLabel={true} size="md" />
                </div>
              </div>

              {/* Preview de Cores */}
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

              {/* Botões de Exemplo */}
              <div>
                <label className="block text-sm font-medium mb-3 text-gray-300">
                  Exemplos de Elementos
                </label>
                <div className="space-y-3">
                  <Button variant="accent" className="w-full">
                    Botão Principal
                  </Button>
                  <Button variant="outline" className="w-full">
                    Botão Secundário
                  </Button>
                  <div className="p-3 bg-[#1e2126] rounded-lg border border-accent">
                    <div className="text-accent font-medium">Card com Destaque</div>
                    <div className="text-gray-400 text-sm">Exemplo de card destacado com a cor do tema</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Outras Configurações */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Settings size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Configurações Gerais</h2>
                <p className="text-sm text-gray-400">Configurações do sistema e preferências</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Configurações de Interface */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-gray-300">Interface</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                    <div>
                      <div className="text-white font-medium">Sidebar Colapsada</div>
                      <div className="text-sm text-gray-400">Iniciar com menu lateral recolhido</div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                    <div>
                      <div className="text-white font-medium">Animações</div>
                      <div className="text-sm text-gray-400">Habilitar animações da interface</div>
                    </div>
                    <input
                      type="checkbox"
                      defaultChecked
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              {/* Configurações de Notificação */}
              <div>
                <h3 className="text-sm font-medium mb-3 text-gray-300">Notificações</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-[#1e2126] rounded-lg">
                    <div>
                      <div className="text-white font-medium">Notificações Push</div>
                      <div className="text-sm text-gray-400">Receber notificações do sistema</div>
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
                      <div className="text-sm text-gray-400">Receber resumo semanal por email</div>
                    </div>
                    <input
                      type="checkbox"
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                  </div>
                </div>
              </div>

              {/* Botão Salvar */}
              <div className="pt-4 border-t border-gray-700">
                <Button variant="accent" className="w-full flex items-center gap-2">
                  <Save size={16} />
                  Salvar Configurações
                </Button>
              </div>
            </div>
          </Card>
        </div>

        {/* Card de Informações */}
        <Card className="p-6 mt-6">
          <div className="flex items-center gap-3 mb-4">
            <Monitor size={20} className="text-accent" />
            <h3 className="text-lg font-medium text-white">Sobre os Temas</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-white mb-2">Recursos Disponíveis</h4>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• {availableThemes.length} temas de cores diferentes</li>
                <li>• Mudança em tempo real</li>
                <li>• Preferência salva automaticamente</li>
                <li>• Cores aplicadas em toda a interface</li>
                <li>• Compatível com modo escuro</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-white mb-2">Acessibilidade</h4>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>• Contraste otimizado para leitura</li>
                <li>• Suporte a leitores de tela</li>
                <li>• Navegação por teclado</li>
                <li>• Respeita preferências de movimento</li>
                <li>• Cores testadas para daltonismo</li>
              </ul>
            </div>
          </div>
        </Card>
      </AccessGuard>
    </DashboardLayout>
  );
}