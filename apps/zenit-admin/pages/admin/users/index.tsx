import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListToolbar } from '@/components/ui/ListToolbar';
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
  role: string;
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
  const [query, setQuery] = useState('');
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
        title: 'Confirmar exclusão',
        message: `Tem certeza que deseja excluir o usuario "${user.name}"? Esta ação não pode ser desfeita.`,
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

  const normalizedQuery = query
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const filtered = users.filter((item) =>
    [item.name, item.email, ...item.companies.map((entry) => entry.company.name)]
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(normalizedQuery)
  );

  return (
    <DashboardLayout title="Usuários">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Usuários' }]} />

      <AccessGuard requiredRole="SUPERUSER">
        <PageHeader title="Usuários">
          <Link href="/admin/users/new" className="admin-button admin-button-primary">
            <Plus size={16} />
            Novo usuário
          </Link>
        </PageHeader>

        <Card className="p-0">
          {!loading && !error && (
            <ListToolbar
              query={query}
              onChange={setQuery}
              placeholder="Buscar usuários"
              count={filtered.length}
              label={filtered.length === 1 ? 'usuário' : 'usuários'}
            />
          )}
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="mb-4 text-tone-red">{error}</div>
              <Button variant="outline" onClick={() => void fetchUsers()}>
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <Users size={32} />
              <p>Nenhum usuário encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <caption className="sr-only">Usuários</caption>
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Empresa</th>
                    <th className="w-24 px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id} className="border-b border-border hover:bg-elevated">
                      <td data-label="Usuário" className="px-4 py-3 font-medium text-text">
                        <Link className="admin-row-title" href={'/admin/users/' + user.id}>
                          {user.name}
                        </Link>
                        {user.role === 'ADMIN' && (
                          <span className="mt-1 block text-xs text-accent">
                            Administrador do Zenit
                          </span>
                        )}
                      </td>
                      <td data-label="E-mail" className="px-4 py-3 text-text">
                        {user.email}
                      </td>
                      <td data-label="Empresas" className="px-4 py-3 text-text">
                        {user.companies.map((companyUser) => companyUser.company.name).join(', ') ||
                          '—'}
                      </td>
                      <td data-label="Ações" className="px-4 py-3">
                        <div className="admin-row-actions">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="p-1 text-text transition-colors hover:text-accent"
                            aria-label={'Editar ' + user.name}
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          {canManageUsers() && (
                            <button
                              onClick={() => void handleDelete(user)}
                              className="p-1 text-text transition-colors hover:text-tone-red"
                              aria-label={'Excluir ' + user.name}
                              title="Excluir"
                              disabled={confirmation.loading}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
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
