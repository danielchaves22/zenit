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
  const [query, setQuery] = useState('');
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
        title: 'Confirmar exclusão',
        message: `Tem certeza que deseja excluir a empresa "${company.name}"? Esta ação não pode ser desfeita.`,
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

  const normalizedQuery = query
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const filtered = companies.filter((item) =>
    [item.name, item.code, item.address]
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes(normalizedQuery)
  );

  return (
    <DashboardLayout title="Empresas">
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Empresas' }]} />

      <AccessGuard allowedRoles={['ADMIN']}>
        <PageHeader title="Empresas">
          <Link href="/admin/companies/new" className="admin-button admin-button-primary">
            <Plus size={16} />
            Nova empresa
          </Link>
        </PageHeader>

        <Card className="p-0">
          {!loading && !error && (
            <ListToolbar
              query={query}
              onChange={setQuery}
              placeholder="Buscar empresas"
              count={filtered.length}
              label={filtered.length === 1 ? 'empresa' : 'empresas'}
            />
          )}
          {loading ? (
            <div className="space-y-3 p-6">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <div className="mb-4 text-tone-red">{error}</div>
              <Button variant="outline" onClick={() => void fetchCompanies()}>
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="admin-empty">
              <Building2 size={32} />
              <p>Nenhuma empresa encontrada</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <caption className="sr-only">Empresas</caption>
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-left">Código</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Endereço</th>
                    <th className="px-4 py-3 text-left">Criada em</th>
                    <th className="w-24 px-4 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((company) => (
                    <tr key={company.id} className="border-b border-border hover:bg-elevated">
                      <td data-label="Código" className="px-4 py-3">
                        <span className="font-mono font-medium text-accent">
                          {company.code.toString().padStart(3, '0')}
                        </span>
                      </td>
                      <td data-label="Empresa" className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Building2 size={16} className="text-tone-blue" />
                          <Link className="admin-row-title" href={'/admin/companies/' + company.id}>
                            {company.name}
                          </Link>
                        </div>
                      </td>
                      <td data-label="Endereço" className="px-4 py-3 text-text">
                        {company.address || '-'}
                      </td>
                      <td data-label="Criada em" className="px-4 py-3 text-text">
                        {new Date(company.createdAt).toLocaleDateString('pt-BR')}
                      </td>
                      <td data-label="Ações" className="px-4 py-3">
                        <div className="admin-row-actions">
                          <Link
                            href={`/admin/companies/${company.id}`}
                            className="p-1 text-text transition-colors hover:text-accent"
                            aria-label={'Editar ' + company.name}
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => void handleDelete(company)}
                            className="p-1 text-text transition-colors hover:text-tone-red"
                            aria-label={'Excluir ' + company.name}
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
