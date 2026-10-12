import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListToolbar } from '@/components/ui/ListToolbar';
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import BankIconPreview from '@/components/admin/BankIconPreview';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import api from '@/lib/api';
import { AdminBank } from '@/utils/banks';
import { Edit2, Landmark, Plus, Trash2 } from 'lucide-react';

export default function BanksPage() {
  const [query, setQuery] = useState('');
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [banks, setBanks] = useState<AdminBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchBanks();
  }, []);

  async function fetchBanks() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/admin/banks');
      setBanks(response.data || []);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar bancos';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(bank: AdminBank) {
    confirmation.confirm(
      {
        title: 'Confirmar exclusão',
        message: `Tem certeza que deseja excluir o banco "${bank.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/admin/banks/${bank.id}`);
          addToast('Banco excluido com sucesso', 'success');
          await fetchBanks();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir banco', 'error');
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
  const filtered = banks.filter((item) =>
    [item.name, item.code]
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(normalizedQuery)
  );

  return (
    <DashboardLayout title="Bancos">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Bancos' }]} />

      <AccessGuard allowedRoles={['ADMIN']}>
        <PageHeader title="Bancos">
          <Link href="/admin/banks/new" className="admin-button admin-button-primary">
            <Plus size={16} />
            Novo banco
          </Link>
        </PageHeader>

        <Card className="p-0">
          {!loading && !error && (
            <ListToolbar
              query={query}
              onChange={setQuery}
              placeholder="Buscar bancos"
              count={filtered.length}
              label={filtered.length === 1 ? 'banco' : 'bancos'}
            />
          )}
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(4)].map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="mb-4 text-tone-red">{error}</div>
              <Button variant="outline" onClick={() => void fetchBanks()}>
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <Landmark size={32} />
              <p>Nenhum banco encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <caption className="sr-only">Bancos</caption>
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">Banco</th>
                    <th className="px-4 py-3 text-left">Código</th>
                    <th className="px-4 py-3 text-left">Ordem</th>
                    <th className="px-4 py-3 text-left">Cartões</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="w-24 px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((bank) => (
                    <tr key={bank.id} className="border-b border-border hover:bg-elevated">
                      <td data-label="Banco" className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <BankIconPreview iconPath={bank.iconPath} label={bank.name} size="sm" />
                          <Link className="admin-row-title" href={'/admin/banks/' + bank.id}>
                            {bank.name}
                          </Link>
                        </div>
                      </td>
                      <td data-label="Código" className="px-4 py-3">
                        <span className="font-mono text-accent">{bank.code}</span>
                      </td>
                      <td data-label="Ordem" className="px-4 py-3 text-text">
                        {bank.displayOrder}
                      </td>
                      <td data-label="Cartões" className="px-4 py-3 text-text">
                        {bank.linkedAccountsCount || 0}
                      </td>
                      <td data-label="Situação" className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            bank.isActive
                              ? 'bg-tone-green-soft text-tone-green'
                              : 'bg-gray-500/15 text-text'
                          }`}
                        >
                          {bank.isActive ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td data-label="Ações" className="px-4 py-3">
                        <div className="admin-row-actions">
                          <Link
                            href={`/admin/banks/${bank.id}`}
                            className="p-1 text-text transition-colors hover:text-accent"
                            aria-label={'Editar ' + bank.name}
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => void handleDelete(bank)}
                            className="p-1 text-text transition-colors hover:text-tone-red"
                            aria-label={'Excluir ' + bank.name}
                            title="Excluir"
                            disabled={confirmation.loading}
                          >
                            <Trash2 size={16} />
                          </button>
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
