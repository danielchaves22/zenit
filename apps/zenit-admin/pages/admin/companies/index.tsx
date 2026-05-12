import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { useToast } from '@/components/ui/ToastContext';
import { Plus, Building2, Edit2, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';

interface Company {
  id: number;
  name: string;
  address?: string;
  code: number;
  createdAt: string;
  updatedAt: string;
}

export default function CompaniesPage() {
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchCompanies();
  }, []);

  async function fetchCompanies() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/companies');
      setCompanies(response.data || []);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar empresas';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(company: Company) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusao',
        message: `Tem certeza que deseja excluir a empresa "${company.name}"? Esta acao nao pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/companies/${company.id}`);
          addToast('Empresa excluida com sucesso', 'success');
          await fetchCompanies();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir empresa', 'error');
          throw err;
        }
      }
    );
  }

  return (
    <DashboardLayout title="Empresas">
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Administracao' },
          { label: 'Empresas' }
        ]}
      />

      <AccessGuard allowedRoles={['ADMIN']}>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Empresas</h1>
          <Link href="/admin/companies/new">
            <Button variant="accent" className="flex items-center gap-2">
              <Plus size={16} />
              Nova Empresa
            </Button>
          </Link>
        </div>

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-[#1e2126]" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="mb-4 text-red-400">{error}</div>
              <Button variant="outline" onClick={() => void fetchCompanies()}>
                Tentar Novamente
              </Button>
            </div>
          ) : companies.length === 0 ? (
            <div className="py-10 text-center">
              <Building2 size={48} className="mx-auto mb-4 text-gray-400" />
              <p className="mb-4 text-gray-400">Nenhuma empresa cadastrada</p>
              <Link href="/admin/companies/new">
                <Button variant="accent" className="inline-flex items-center gap-2">
                  <Plus size={16} />
                  Criar Primeira Empresa
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                  <tr>
                    <th className="w-24 px-4 py-3 text-center">Acoes</th>
                    <th className="px-4 py-3 text-left">Codigo</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Endereco</th>
                    <th className="px-4 py-3 text-left">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className="border-b border-gray-700 hover:bg-[#1a1f2b]">
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Link
                            href={`/admin/companies/${company.id}`}
                            className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => void handleDelete(company)}
                            className="p-1 text-gray-300 transition-colors hover:text-red-400"
                            title="Excluir"
                            disabled={confirmation.loading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-medium text-[#2563eb]">
                          {company.code.toString().padStart(3, '0')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Building2 size={16} className="text-blue-400" />
                          <span className="font-medium text-white">{company.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{company.address || '-'}</td>
                      <td className="px-4 py-3 text-gray-300">
                        {new Date(company.createdAt).toLocaleDateString('pt-BR')}
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
