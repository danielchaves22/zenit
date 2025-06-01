// frontend/pages/example-integration.tsx - EXEMPLO PRÁTICO DE INTEGRAÇÃO COMPLETA
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { SmartBreadcrumb } from '@/components/ui/SmartBreadcrumb';
import { SmartNavigation } from '@/components/ui/SmartNavigation';
import { usePermissions } from '@/hooks/usePermissions';
import { useConfirmation } from '@/hooks/useConfirmation';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useToast } from '@/components/ui/ToastContext';
import { 
  Shield, Users, Building2, Settings, Eye, EyeOff, 
  Check, X, AlertTriangle, Info 
} from 'lucide-react';

// 🎯 EXEMPLO PRÁTICO: Página que demonstra TODOS os conceitos RBAC implementados
export default function ExampleIntegrationPage() {
  const {
    canManageUsers,
    canManageCompanies,
    canAccessSettings,
    isAdmin,
    isSuperUserOrAbove,
    currentRole,
    getRoleLabel
  } = usePermissions();

  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  // ✅ BREADCRUMB CUSTOMIZADO
  const breadcrumbItems = [
    { label: 'Dashboard', href: '/', icon: <Shield size={14} /> },
    { label: 'Exemplos' },
    { label: 'Integração RBAC' }
  ];

  // ✅ FUNÇÃO COM CONFIRMAÇÃO
  const handleDangerousAction = () => {
    confirmation.confirm(
      {
        title: 'Ação Perigosa',
        message: 'Esta é uma demonstração de confirmação. Continuar?',
        confirmText: 'Sim, Continuar',
        cancelText: 'Cancelar',
        type: 'warning'
      },
      async () => {
        // Simular operação
        await new Promise(resolve => setTimeout(resolve, 1000));
        addToast('Ação executada com sucesso!', 'success');
      }
    );
  };

  return (
    <DashboardLayout title="Exemplo de Integração RBAC">
      {/* ✅ BREADCRUMB INTELIGENTE */}
      <SmartBreadcrumb items={breadcrumbItems} />

      <div className="space-y-8">
        {/* ✅ HEADER COM INFORMAÇÕES DO USUÁRIO */}
        <Card className="bg-gradient-to-r from-accent/10 to-transparent">
          <div className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-white mb-2">
                  Exemplo de Integração RBAC
                </h1>
                <p className="text-gray-300">
                  Esta página demonstra todos os componentes de controle de acesso implementados.
                </p>
              </div>
              <div className="bg-[#1e2126] rounded-lg p-4 border border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <Shield size={16} className="text-accent" />
                  <span className="text-sm font-medium text-white">Seu Perfil</span>
                </div>
                <div className="text-accent font-medium">{getRoleLabel()}</div>
                <div className="text-xs text-gray-400">Role: {currentRole}</div>
              </div>
            </div>
          </div>
        </Card>

        {/* ✅ DEMONSTRAÇÃO DE VERIFICAÇÕES DE PERMISSÃO */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Card de Gerenciar Usuários */}
          <Card className={`p-6 ${canManageUsers() ? 'border-green-600' : 'border-red-600'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${canManageUsers() ? 'bg-green-600' : 'bg-red-600'}`}>
                <Users size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-medium text-white">Gerenciar Usuários</h3>
                <p className="text-sm text-gray-400">Requer: SUPERUSER+</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              {canManageUsers() ? (
                <>
                  <Check size={16} className="text-green-400" />
                  <span className="text-green-400 text-sm">Acesso Permitido</span>
                </>
              ) : (
                <>
                  <X size={16} className="text-red-400" />
                  <span className="text-red-400 text-sm">Acesso Negado</span>
                </>
              )}
            </div>

            {/* ✅ RENDERIZAÇÃO CONDICIONAL */}
            {canManageUsers() ? (
              <Button variant="accent" className="w-full">
                Acessar Gerenciamento
              </Button>
            ) : (
              <Button variant="outline" disabled className="w-full">
                Sem Permissão
              </Button>
            )}
          </Card>

          {/* Card de Gerenciar Empresas */}
          <Card className={`p-6 ${canManageCompanies() ? 'border-green-600' : 'border-red-600'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${canManageCompanies() ? 'bg-green-600' : 'bg-red-600'}`}>
                <Building2 size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-medium text-white">Gerenciar Empresas</h3>
                <p className="text-sm text-gray-400">Requer: ADMIN</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              {canManageCompanies() ? (
                <>
                  <Check size={16} className="text-green-400" />
                  <span className="text-green-400 text-sm">Acesso Permitido</span>
                </>
              ) : (
                <>
                  <X size={16} className="text-red-400" />
                  <span className="text-red-400 text-sm">Acesso Negado</span>
                </>
              )}
            </div>

            {canManageCompanies() ? (
              <Button variant="accent" className="w-full">
                Acessar Empresas
              </Button>
            ) : (
              <Button variant="outline" disabled className="w-full">
                Sem Permissão
              </Button>
            )}
          </Card>

          {/* Card de Configurações */}
          <Card className={`p-6 ${canAccessSettings() ? 'border-green-600' : 'border-red-600'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`p-2 rounded-lg ${canAccessSettings() ? 'bg-green-600' : 'bg-red-600'}`}>
                <Settings size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-medium text-white">Configurações</h3>
                <p className="text-sm text-gray-400">Requer: SUPERUSER+</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 mb-4">
              {canAccessSettings() ? (
                <>
                  <Check size={16} className="text-green-400" />
                  <span className="text-green-400 text-sm">Acesso Permitido</span>
                </>
              ) : (
                <>
                  <X size={16} className="text-red-400" />
                  <span className="text-red-400 text-sm">Acesso Negado</span>
                </>
              )}
            </div>

            {canAccessSettings() ? (
              <Button variant="accent" className="w-full">
                Acessar Configurações
              </Button>
            ) : (
              <Button variant="outline" disabled className="w-full">
                Sem Permissão
              </Button>
            )}
          </Card>
        </div>

        {/* ✅ SEÇÃO COM ACCESS GUARD */}
        <AccessGuard requiredRole="SUPERUSER">
          <Card className="border-blue-600">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-600 rounded-lg">
                  <AlertTriangle size={20} className="text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white">Área Administrativa</h3>
                  <p className="text-blue-200">Esta seção só é visível para SUPERUSER e ADMIN</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium text-white mb-3">Ações Disponíveis</h4>
                  <div className="space-y-2">
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={() => setShowAdminPanel(!showAdminPanel)}
                    >
                      {showAdminPanel ? <EyeOff size={16} /> : <Eye size={16} />}
                      <span className="ml-2">
                        {showAdminPanel ? 'Ocultar' : 'Mostrar'} Painel Admin
                      </span>
                    </Button>
                    
                    <Button 
                      variant="outline" 
                      className="w-full justify-start"
                      onClick={handleDangerousAction}
                    >
                      <AlertTriangle size={16} />
                      <span className="ml-2">Ação com Confirmação</span>
                    </Button>

                    {/* ✅ BOTÃO ESPECÍFICO PARA ADMIN */}
                    {isAdmin() && (
                      <Button 
                        variant="danger" 
                        className="w-full justify-start"
                        onClick={() => addToast('Funcionalidade exclusiva de ADMIN', 'info')}
                      >
                        <Shield size={16} />
                        <span className="ml-2">Função Exclusiva Admin</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* ✅ PAINEL CONDICIONAL */}
                {showAdminPanel && (
                  <div className="bg-[#1e2126] rounded-lg p-4 border border-gray-700">
                    <h4 className="font-medium text-white mb-3">Painel Administrativo</h4>
                    <div className="space-y-3">
                      <Input
                        label="Nome"
                        value={formData.name}
                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                        placeholder="Digite um nome..."
                        className="mb-0"
                      />
                      <Input
                        label="Email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="Digite um email..."
                        className="mb-0"
                      />
                      <Button variant="accent" className="w-full">
                        Salvar Dados
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </AccessGuard>

        {/* ✅ NAVEGAÇÃO INTELIGENTE */}
        <Card>
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-accent rounded-lg">
                <Info size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-white">Navegação Baseada em Permissões</h3>
                <p className="text-gray-400">
                  Os itens abaixo são filtrados automaticamente baseado no seu perfil
                </p>
              </div>
            </div>

            <SmartNavigation 
              showCategories={true}
              showDescriptions={true}
              layout="compact"
              maxItems={8}
            />
          </div>
        </Card>

        {/* ✅ INFORMAÇÕES DE DEBUG */}
        <Card className="bg-gray-900/50 border-gray-600">
          <div className="p-6">
            <h3 className="text-lg font-medium text-white mb-4">Informações de Debug</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-white mb-2">Permissões Ativas</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gerenciar Usuários:</span>
                    <span className={canManageUsers() ? 'text-green-400' : 'text-red-400'}>
                      {canManageUsers() ? 'Sim' : 'Não'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Gerenciar Empresas:</span>
                    <span className={canManageCompanies() ? 'text-green-400' : 'text-red-400'}>
                      {canManageCompanies() ? 'Sim' : 'Não'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Acessar Configurações:</span>
                    <span className={canAccessSettings() ? 'text-green-400' : 'text-red-400'}>
                      {canAccessSettings() ? 'Sim' : 'Não'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">É Admin:</span>
                    <span className={isAdmin() ? 'text-green-400' : 'text-red-400'}>
                      {isAdmin() ? 'Sim' : 'Não'}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-white mb-2">Informações do Usuário</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Role Atual:</span>
                    <span className="text-accent font-medium">{currentRole}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Label do Role:</span>
                    <span className="text-white">{getRoleLabel()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">É SuperUser+:</span>
                    <span className={isSuperUserOrAbove() ? 'text-green-400' : 'text-red-400'}>
                      {isSuperUserOrAbove() ? 'Sim' : 'Não'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ✅ MODAL DE CONFIRMAÇÃO */}
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

/*
🎯 ESTE EXEMPLO DEMONSTRA:

✅ Breadcrumb personalizado
✅ Verificações de permissão em tempo real  
✅ Renderização condicional baseada em roles
✅ AccessGuard protegendo seções
✅ Uso do hook usePermissions
✅ Sistema de confirmação
✅ Navegação inteligente filtrada
✅ Botões específicos por role
✅ Informações de debug
✅ Integração com sistema de toast
✅ Layout responsivo
✅ Design consistente com tema

Para testar:
1. Faça login com diferentes roles (USER, SUPERUSER, ADMIN)
2. Observe como a interface se adapta automaticamente
3. Teste as funcionalidades disponíveis para cada role
4. Verifique as informações de debug na parte inferior

🚀 Este é um exemplo completo de como usar TODOS os componentes RBAC implementados!
*/