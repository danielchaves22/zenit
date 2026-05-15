import Link from 'next/link';
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
        title: 'Confirmar Exclusao',
        message: `Tem certeza que deseja excluir o banco "${bank.name}"? Esta acao nao pode ser desfeita.`,
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

  return (
    <DashboardLayout title="Bancos">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administracao' },
          { label: 'Bancos' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Bancos</h1>
          <Link href="/admin/banks/new">
            <Button variant="accent" className="flex items-center gap-2">
              <Plus size={16} />
              Novo Banco
            </Button>
          </Link>
        </div>

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded bg-[#1e2126]" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="mb-4 text-red-400">{error}</div>
              <Button variant="outline" onClick={() => void fetchBanks()}>
                Tentar Novamente
              </Button>
            </div>
          ) : banks.length === 0 ? (
            <div className="py-10 text-center">
              <Landmark size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="mb-4 text-gray-400">Nenhum banco cadastrado</p>
              <Link href="/admin/banks/new">
                <Button variant="accent" className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  Criar Primeiro Banco
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                  <tr>
                    <th className="w-24 px-4 py-3 text-center">Acoes</th>
                    <th className="px-4 py-3 text-left">Banco</th>
                    <th className="px-4 py-3 text-left">Codigo</th>
                    <th className="px-4 py-3 text-left">Icone</th>
                    <th className="px-4 py-3 text-left">Ordem</th>
                    <th className="px-4 py-3 text-left">Cartoes</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {banks.map((bank) => (
                    <tr key={bank.id} className="border-b border-gray-700 hover:bg-[#1a1f2b]">
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/admin/banks/${bank.id}`}
                            className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => void handleDelete(bank)}
                            className="p-1 text-gray-300 transition-colors hover:text-red-400"
                            title="Excluir"
                            disabled={confirmation.loading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <BankIconPreview iconPath={bank.iconPath} label={bank.name} size="sm" />
                          <span className="font-medium text-white">{bank.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[#60a5fa]">{bank.code}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{bank.iconSlug}</td>
                      <td className="px-4 py-3 text-gray-300">{bank.displayOrder}</td>
                      <td className="px-4 py-3 text-gray-300">{bank.linkedAccountsCount || 0}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            bank.isActive
                              ? 'bg-green-500/15 text-green-300'
                              : 'bg-gray-500/15 text-gray-300'
                          }`}
                        >
                          {bank.isActive ? 'Ativo' : 'Inativo'}
                        </span>
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
