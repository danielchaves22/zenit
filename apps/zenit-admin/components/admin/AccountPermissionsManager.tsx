// frontend/components/admin/AccountPermissionsManager.tsx
import React, { useState, useEffect } from 'react';
import { useToast } from '@/components/ui/ToastContext';
import { useAccountPermissions } from '@/hooks/useAccountPermissions';
import { CreditCard, Check, Users, AlertCircle } from 'lucide-react';
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
  companyId: number;
  selectedAccountIds: number[];
  onPermissionsChange: (accountIds: number[], grantAll: boolean) => void;
  disabled?: boolean;
  showCurrentPermissions?: boolean;
}

export default function AccountPermissionsManager({
  userId,
  companyId,
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
  }, [userId, showCurrentPermissions, companyId]);

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
      const response = await api.get('/financial/accounts', {
        headers: { 'X-Company-Id': companyId }
      });
      setAccounts(response.data);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
      addToast('Erro ao carregar contas financeiras', 'error');
    }
  }

  async function fetchCurrentAccess() {
    if (!userId) return;

    const permissions = await fetchUserPermissions(userId, companyId);
    if (permissions) {
      setCurrentAccess(permissions);
      const accessibleIds = permissions.accounts
        .filter(acc => acc.hasAccess)
        .map(acc => acc.id);
      onPermissionsChange(accessibleIds, permissions.hasFullAccess);
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
    <div className="space-y-2">
      <div className="p-3 bg-elevated border border-gray-700 rounded-lg">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={grantAllAccess}
            onChange={handleGrantAllToggle}
            disabled={disabled || totalActiveCount === 0}
            className="w-4 h-4 text-accent bg-background border-gray-700 rounded focus:ring-accent"
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

      {!grantAllAccess && (
        <div className="space-y-2">
          {(loading || permissionsLoading) ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-elevated rounded animate-pulse" />
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

                return (
                  <label
                    key={account.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent/10 border-accent'
                        : 'bg-elevated border-gray-700 hover:bg-elevated'
                    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleAccountToggle(account.id)}
                      disabled={disabled}
                      className="w-4 h-4 text-accent bg-background border-gray-700 rounded focus:ring-accent"
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
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

    </div>
  );
}