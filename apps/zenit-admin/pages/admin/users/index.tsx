import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { useToast } from '@/components/ui/ToastContext';
import { usePermissions } from '@/hooks/usePermissions';
import { Edit2, Plus, Trash2, Users } from 'lucide-react';
import api from '@/lib/api';

interface User {
  id: number;
  name: string;
  email: string;
  companies: {
    company: {
      id: number;
      name: string;
      code: number;
    };
    role: string;
  }[];
}

export default function UsersPage() {
  const confirmation = useConfirmation();
  const { canManageUsers } = usePermissions();
  const { addToast } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/users');
      setUsers(response.data || []);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar usuarios';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(user: User) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusao',
        message: `Tem certeza que deseja excluir o usuario "${user.name}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/users/${user.id}`);
          addToast('Usuario excluido com sucesso', 'success');
          await fetchUsers();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir usuario', 'error');
          throw err;
        }
      }
    );
  }

  return (
    <DashboardLayout title="Usuarios">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administracao' },
          { label: 'Usuarios' }
        ]}
      />

      <AccessGuard requiredRole="SUPERUSER">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Usuarios</h1>
          <Link href="/admin/users/new">
            <Button variant="accent" className="flex items-center gap-2">
              <Plus size={16} />
              Novo Usuario
            </Button>
          </Link>
        </div>

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-[#1e2126]" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="mb-4 text-red-400">{error}</div>
              <Button variant="outline" onClick={() => void fetchUsers()}>
                Tentar Novamente
              </Button>
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center">
              <Users size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="mb-4 text-gray-400">Nenhum usuario encontrado</p>
              <Link href="/admin/users/new">
                <Button variant="accent" className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  Criar Primeiro Usuario
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                  <tr>
                    <th className="w-24 px-4 py-3 text-center">Acoes</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-gray-700 hover:bg-[#1a1f2b]">
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          {canManageUsers() && (
                            <button
                              onClick={() => void handleDelete(user)}
                              className="p-1 text-gray-300 transition-colors hover:text-red-400"
                              title="Excluir"
                              disabled={confirmation.loading}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-white">{user.name}</td>
                      <td className="px-4 py-3 text-gray-300">{user.email}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {user.companies.map((companyUser) => companyUser.company.name).join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
