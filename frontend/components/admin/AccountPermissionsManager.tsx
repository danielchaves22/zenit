// frontend/components/admin/AccountPermissionsManager.tsx
import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/ToastContext';
import { useAccountPermissions } from '@/hooks/useAccountPermissions';
import { CreditCard, Check, Lock, Users, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

interface Account {
  id: number;
  name: string;
  type: string;
  isActive: boolean;
}

interface AccountAccess {
  id: number;
  name: string;
  type: string;
  hasAccess: boolean;
  grantedAt?: string;
  grantedBy?: { id: number; name: string };
}

interface UserAccountAccess {
  totalAccounts: number;
  accessibleAccounts: number;
  hasFullAccess: boolean;
  accounts: AccountAccess[];
}

interface AccountPermissionsManagerProps {
  userId?: number | null; // null para criação, number para edição
  selectedAccountIds: number[];
  onPermissionsChange: (accountIds: number[], grantAll: boolean) => void;
  disabled?: boolean;
  showCurrentPermissions?: boolean;
}

export default function AccountPermissionsManager({
  userId,
  selectedAccountIds,
  onPermissionsChange,
  disabled = false,
  showCurrentPermissions = true
}: AccountPermissionsManagerProps) {
  const { addToast } = useToast();
  const { fetchUserPermissions, loading: permissionsLoading } = useAccountPermissions();
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentAccess, setCurrentAccess] = useState<UserAccountAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [grantAllAccess, setGrantAllAccess] = useState(false);

  useEffect(() => {
    fetchAccounts();
    if (userId && showCurrentPermissions) {
      fetchCurrentAccess();
    }
  }, [userId, showCurrentPermissions]);

  useEffect(() => {
    // Sincronizar grantAllAccess com selectedAccountIds
    if (accounts.length > 0) {
      const allActiveAccountIds = accounts.filter(acc => acc.isActive).map(acc => acc.id);
      const hasAllAccounts = allActiveAccountIds.length > 0 && 
        allActiveAccountIds.every(id => selectedAccountIds.includes(id));
      setGrantAllAccess(hasAllAccounts);
    }
  }, [selectedAccountIds, accounts]);

  async function fetchAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setAccounts(response.data);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
      addToast('Erro ao carregar contas financeiras', 'error');
    }
  }

  async function fetchCurrentAccess() {
    if (!userId) return;
    
    const permissions = await fetchUserPermissions(userId);
    if (permissions) {
      setCurrentAccess(permissions);
    }
  }

  const handleAccountToggle = (accountId: number) => {
    if (disabled) return;

    let newSelectedIds: number[];
    
    if (selectedAccountIds.includes(accountId)) {
      newSelectedIds = selectedAccountIds.filter(id => id !== accountId);
    } else {
      newSelectedIds = [...selectedAccountIds, accountId];
    }
    
    const allActiveAccountIds = accounts.filter(acc => acc.isActive).map(acc => acc.id);
    const hasAllAccounts = allActiveAccountIds.length > 0 && 
      allActiveAccountIds.every(id => newSelectedIds.includes(id));
    
    onPermissionsChange(newSelectedIds, hasAllAccounts);
  };

  const handleGrantAllToggle = () => {
    if (disabled) return;

    const newGrantAll = !grantAllAccess;
    let newSelectedIds: number[];
    
    if (newGrantAll) {
      // Selecionar todas as contas ativas
      newSelectedIds = accounts.filter(acc => acc.isActive).map(acc => acc.id);
    } else {
      // Desmarcar todas
      newSelectedIds = [];
    }
    
    onPermissionsChange(newSelectedIds, newGrantAll);
  };

  const formatAccountType = (type: string): string => {
    const types: Record<string, string> = {
      'CHECKING': 'Conta Corrente',
      'SAVINGS': 'Poupança',
      'CREDIT_CARD': 'Cartão de Crédito',
      'INVESTMENT': 'Investimento',
      'CASH': 'Dinheiro'
    };
    return types[type] || type;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const activeAccounts = accounts.filter(acc => acc.isActive);
  const selectedCount = selectedAccountIds.length;
  const totalActiveCount = activeAccounts.length;

  return (
    <div className="space-y-4">
      {/* Header com Contador */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-medium text-white">Permissões de Acesso a Contas</h4>
          <p className="text-xs text-gray-400 mt-1">
            {selectedCount === 0 
              ? 'Nenhuma conta selecionada - usuário não terá acesso a funcionalidades financeiras'
              : `${selectedCount} de ${totalActiveCount} contas selecionadas`
            }
          </p>
        </div>
        
        {selectedCount === 0 && (
          <div className="flex items-center gap-1 text-yellow-400">
            <AlertCircle size={16} />
            <span className="text-xs">Sem acesso</span>
          </div>
        )}
      </div>

      {/* Toggle Conceder Todas */}
      <div className="p-3 bg-[#1a1f2b] border border-gray-700 rounded-lg">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={grantAllAccess}
            onChange={handleGrantAllToggle}
            disabled={disabled || totalActiveCount === 0}
            className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
          />
          <div className="flex-1">
            <div className="text-sm font-medium text-white">
              Conceder acesso a todas as contas financeiras
            </div>
            <div className="text-xs text-gray-400">
              Usuário terá acesso total às funcionalidades financeiras
            </div>
          </div>
          <Users size={16} className="text-accent" />
        </label>
      </div>

      {/* Lista de Contas */}
      {!grantAllAccess && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            Selecionar Contas Específicas
          </div>
          
          {(loading || permissionsLoading) ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-[#1a1f2b] rounded animate-pulse" />
              ))}
            </div>
          ) : activeAccounts.length === 0 ? (
            <div className="p-4 text-center border border-gray-700 rounded-lg">
              <CreditCard size={24} className="mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-400">Nenhuma conta ativa encontrada</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
              {activeAccounts.map(account => {
                const isSelected = selectedAccountIds.includes(account.id);
                const currentAccountAccess = currentAccess?.accounts.find(acc => acc.id === account.id);
                
                return (
                  <label
                    key={account.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-accent/10 border-accent' 
                        : 'bg-[#1a1f2b] border-gray-700 hover:bg-[#262b36]'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleAccountToggle(account.id)}
                      disabled={disabled}
                      className="w-4 h-4 text-accent bg-[#1e2126] border-gray-700 rounded focus:ring-accent"
                    />
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CreditCard size={14} className="text-blue-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-white truncate">
                          {account.name}
                        </span>
                        {isSelected && (
                          <Check size={14} className="text-accent flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          {formatAccountType(account.type)}
                        </span>
                        
                        {/* Informações da Permissão Atual */}
                        {currentAccountAccess && showCurrentPermissions && (
                          <div className="text-xs text-gray-500">
                            {currentAccountAccess.hasAccess ? (
                              <span className="text-green-400">
                                Acesso desde {currentAccountAccess.grantedAt && formatDate(currentAccountAccess.grantedAt)}
                              </span>
                            ) : (
                              <span className="text-gray-500">Sem acesso</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Resumo das Permissões Atuais (apenas para edição) */}
      {userId && currentAccess && showCurrentPermissions && (
        <div className="p-3 bg-blue-900/20 border border-blue-600 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Lock size={14} className="text-blue-400" />
            <span className="text-sm font-medium text-blue-300">Permissões Atuais</span>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-blue-200">Total de contas:</span>
              <div className="font-medium text-white">{currentAccess.totalAccounts}</div>
            </div>
            <div>
              <span className="text-blue-200">Contas acessíveis:</span>
              <div className="font-medium text-white">{currentAccess.accessibleAccounts}</div>
            </div>
          </div>
          {currentAccess.hasFullAccess && (
            <div className="mt-2 px-2 py-1 bg-green-700 text-green-100 text-xs rounded">
              Acesso total ativo
            </div>
          )}
        </div>
      )}

      {/* Warning para usuário sem permissões */}
      {selectedCount === 0 && (
        <div className="p-3 bg-yellow-900/20 border border-yellow-600 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-yellow-200">
              <strong>Atenção:</strong> Usuário não terá acesso a funcionalidades financeiras. 
              Dashboard, transações e relatórios ficarão vazios até que permissões sejam concedidas.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}