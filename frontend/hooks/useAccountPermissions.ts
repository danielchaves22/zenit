// frontend/hooks/useAccountPermissions.ts
import { useState } from 'react';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

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

export function useAccountPermissions() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  // Buscar permissões atuais de um usuário
  const fetchUserPermissions = async (userId: number): Promise<UserAccountAccess | null> => {
    setLoading(true);
    try {
      const response = await api.get(`/users/${userId}/account-access`);
      return response.data;
    } catch (error: any) {
      console.error('Erro ao buscar permissões:', error);
      addToast('Erro ao carregar permissões do usuário', 'error');
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Conceder acesso a contas específicas
  const grantAccountAccess = async (userId: number, accountIds: number[]): Promise<boolean> => {
    setLoading(true);
    try {
      await api.post(`/users/${userId}/account-access/grant`, {
        accountIds
      });
      addToast('Permissões concedidas com sucesso', 'success');
      return true;
    } catch (error: any) {
      console.error('Erro ao conceder permissões:', error);
      addToast(error.response?.data?.error || 'Erro ao conceder permissões', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Conceder acesso a todas as contas
  const grantAllAccountAccess = async (userId: number): Promise<boolean> => {
    setLoading(true);
    try {
      await api.post(`/users/${userId}/account-access/grant-all`);
      addToast('Acesso total concedido com sucesso', 'success');
      return true;
    } catch (error: any) {
      console.error('Erro ao conceder acesso total:', error);
      addToast(error.response?.data?.error || 'Erro ao conceder acesso total', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Revogar acesso a contas específicas
  const revokeAccountAccess = async (userId: number, accountIds: number[]): Promise<boolean> => {
    setLoading(true);
    try {
      await api.delete(`/users/${userId}/account-access/revoke`, {
        data: { accountIds }
      });
      addToast('Permissões revogadas com sucesso', 'success');
      return true;
    } catch (error: any) {
      console.error('Erro ao revogar permissões:', error);
      addToast(error.response?.data?.error || 'Erro ao revogar permissões', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Revogar todo o acesso
  const revokeAllAccountAccess = async (userId: number): Promise<boolean> => {
    setLoading(true);
    try {
      await api.delete(`/users/${userId}/account-access/revoke-all`);
      addToast('Todo acesso revogado com sucesso', 'success');
      return true;
    } catch (error: any) {
      console.error('Erro ao revogar todo acesso:', error);
      addToast(error.response?.data?.error || 'Erro ao revogar todo acesso', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Atualizar permissões em lote (substitui todas as existentes)
  const bulkUpdateAccountAccess = async (userId: number, accountIds: number[]): Promise<boolean> => {
    setLoading(true);
    try {
      await api.post(`/users/${userId}/account-access/bulk-update`, {
        accountIds
      });
      addToast('Permissões atualizadas com sucesso', 'success');
      return true;
    } catch (error: any) {
      console.error('Erro ao atualizar permissões:', error);
      addToast(error.response?.data?.error || 'Erro ao atualizar permissões', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    fetchUserPermissions,
    grantAccountAccess,
    grantAllAccountAccess,
    revokeAccountAccess,
    revokeAllAccountAccess,
    bulkUpdateAccountAccess
  };
}