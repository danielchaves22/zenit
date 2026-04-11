import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { useToast } from '@/components/ui/ToastContext';
import TagMultiSelectAutocomplete, { TagOption } from '@/components/ui/TagMultiSelectAutocomplete';
import { Plus, FileText, Edit2, Trash2 } from 'lucide-react';
import api from '@/lib/api';

type ProcessStatus = 'SOLICITACAO' | 'INICIAL' | 'CALCULO';
type TagMatchMode = 'ANY' | 'ALL';

interface ProcessTag extends TagOption {}

interface ProcessItem {
  id: number;
  status: ProcessStatus;
  requestingLawyerName: string | null;
  claimantName: string | null;
  notes: string | null;
  createdAt: string;
  processTags: Array<{ tag: ProcessTag }>;
}

interface ProcessListResponse {
  data: ProcessItem[];
  total: number;
  pages: number;
  page: number;
  pageSize: number;
}

const STATUS_OPTIONS: Array<{ value: '' | ProcessStatus; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'SOLICITACAO', label: 'Solicitacao' },
  { value: 'INICIAL', label: 'Inicial' },
  { value: 'CALCULO', label: 'Calculo' }
];

const TAG_MATCH_MODE_STORAGE_KEY = 'processes.tagMatchMode';

function formatStatus(status: ProcessStatus): string {
  if (status === 'SOLICITACAO') return 'Solicitacao';
  if (status === 'INICIAL') return 'Inicial';
  return 'Calculo';
}

function statusClass(status: ProcessStatus): string {
  if (status === 'SOLICITACAO') return 'bg-blue-100 text-blue-900 border border-blue-300';
  if (status === 'INICIAL') return 'bg-amber-100 text-amber-900 border border-amber-300';
  return 'bg-emerald-100 text-emerald-900 border border-emerald-300';
}

export default function ProcessesPage() {
  const router = useRouter();
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [selectedTags, setSelectedTags] = useState<ProcessTag[]>([]);
  const [statusFilter, setStatusFilter] = useState<'' | ProcessStatus>('');
  const [searchFilter, setSearchFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [tagMatchMode, setTagMatchMode] = useState<TagMatchMode>('ANY');
  const [tagMatchModeLoaded, setTagMatchModeLoaded] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(TAG_MATCH_MODE_STORAGE_KEY);
      if (saved === 'ANY' || saved === 'ALL') {
        setTagMatchMode(saved);
      }
    }
    setTagMatchModeLoaded(true);
  }, []);

  useEffect(() => {
    if (!tagMatchModeLoaded || typeof window === 'undefined') return;
    window.localStorage.setItem(TAG_MATCH_MODE_STORAGE_KEY, tagMatchMode);
  }, [tagMatchMode, tagMatchModeLoaded]);

  useEffect(() => {
    if (!tagMatchModeLoaded) return;
    void fetchProcesses(
      page,
      statusFilter,
      searchFilter,
      startDateFilter,
      endDateFilter,
      selectedTags.map((tag) => tag.id),
      tagMatchMode
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, tagMatchModeLoaded]);

  async function fetchTagOptions(query: string): Promise<ProcessTag[]> {
    const params: Record<string, string | number> = { limit: 20 };
    const normalized = query.trim();
    if (normalized) params.search = normalized;

    try {
      const response = await api.get('/process-tags', { params });
      return response.data || [];
    } catch {
      return [];
    }
  }

  async function fetchProcesses(
    pageToFetch: number = page,
    statusToFetch: '' | ProcessStatus = statusFilter,
    searchToFetch: string = searchFilter,
    startDateToFetch: string = startDateFilter,
    endDateToFetch: string = endDateFilter,
    tagIdsToFetch: number[] = selectedTags.map((tag) => tag.id),
    tagMatchModeToFetch: TagMatchMode = tagMatchMode
  ) {
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page: pageToFetch,
        pageSize,
        tagMatchMode: tagMatchModeToFetch
      };

      if (statusToFetch) params.status = statusToFetch;
      if (searchToFetch.trim()) params.search = searchToFetch.trim();
      if (startDateToFetch) params.startDate = new Date(startDateToFetch).toISOString();
      if (endDateToFetch) {
        const endDate = new Date(endDateToFetch);
        endDate.setHours(23, 59, 59, 999);
        params.endDate = endDate.toISOString();
      }
      if (tagIdsToFetch.length) params.tagIds = tagIdsToFetch.join(',');

      const response = await api.get<ProcessListResponse>('/processes', { params });
      setProcesses(response.data.data || []);
      setTotalPages(response.data.pages || 1);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Erro ao carregar processos.';
      setError(errorMessage);
      addToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    const tagIds = selectedTags.map((tag) => tag.id);
    setPage(1);
    void fetchProcesses(1, statusFilter, searchFilter, startDateFilter, endDateFilter, tagIds, tagMatchMode);
  }

  function clearFilters() {
    const currentTagMode = tagMatchMode;
    setStatusFilter('');
    setSearchFilter('');
    setStartDateFilter('');
    setEndDateFilter('');
    setSelectedTags([]);
    setPage(1);
    void fetchProcesses(1, '', '', '', '', [], currentTagMode);
  }

  function openNewForm() {
    router.push('/processes/new');
  }

  function openEditForm(id: number) {
    router.push(`/processes/${id}`);
  }

  async function handleStatusChange(id: number, status: ProcessStatus) {
    try {
      setActionLoading(true);
      await api.patch(`/processes/${id}/status`, { status });
      addToast('Status atualizado com sucesso.', 'success');
      void fetchProcesses(
        page,
        statusFilter,
        searchFilter,
        startDateFilter,
        endDateFilter,
        selectedTags.map((tag) => tag.id),
        tagMatchMode
      );
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao atualizar status.', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  function handleDelete(item: ProcessItem) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusao',
        message: `Deseja excluir o processo #${item.id}? A exclusao sera logica.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          setActionLoading(true);
          await api.delete(`/processes/${item.id}`);
          addToast('Processo excluido com sucesso.', 'success');
          void fetchProcesses(
            page,
            statusFilter,
            searchFilter,
            startDateFilter,
            endDateFilter,
            selectedTags.map((tag) => tag.id),
            tagMatchMode
          );
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir processo.', 'error');
          throw err;
        } finally {
          setActionLoading(false);
        }
      }
    );
  }

  function canGoPrevious(): boolean {
    return page > 1;
  }

  function canGoNext(): boolean {
    return page < totalPages;
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Inicio', href: '/' }, { label: 'Processos' }]} />

      <AccessGuard allowedRoles={['ADMIN', 'SUPERUSER', 'USER']}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Processos</h1>
          <Button variant="accent" onClick={openNewForm} className="flex items-center gap-2" disabled={actionLoading}>
            <Plus size={16} />
            Novo Processo
          </Button>
        </div>

        <Card className="mb-4 overflow-visible">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as '' | ProcessStatus)}
                className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'ALL'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Data inicial</label>
              <Input type="date" value={startDateFilter} onChange={(event) => setStartDateFilter(event.target.value)} />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Data final</label>
              <Input type="date" value={endDateFilter} onChange={(event) => setEndDateFilter(event.target.value)} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-1">Busca</label>
              <Input
                value={searchFilter}
                onChange={(event) => setSearchFilter(event.target.value)}
                placeholder="ID, advogado, reclamante ou observacao"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-3">
              <TagMultiSelectAutocomplete
                id="process-filter-tags"
                label="Filtrar por tags"
                selectedOptions={selectedTags}
                onSelectedOptionsChange={(options) => setSelectedTags(options as ProcessTag[])}
                fetchOptions={fetchTagOptions}
                placeholder="Digite para buscar tags"
                emptyMessage="Nenhuma tag encontrada."
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-1">Combinacao das tags</label>
              <select
                value={tagMatchMode}
                onChange={(event) => setTagMatchMode(event.target.value as TagMatchMode)}
                className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              >
                <option value="ANY">Alguma</option>
                <option value="ALL">Todas</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button variant="accent" onClick={applyFilters} disabled={loading}>
              Filtrar
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={loading}>
              Limpar
            </Button>
          </div>
        </Card>

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <Button
                variant="outline"
                onClick={() =>
                  fetchProcesses(
                    page,
                    statusFilter,
                    searchFilter,
                    startDateFilter,
                    endDateFilter,
                    selectedTags.map((tag) => tag.id),
                    tagMatchMode
                  )
                }
              >
                Tentar novamente
              </Button>
            </div>
          ) : processes.length === 0 ? (
            <div className="text-center py-10">
              <FileText size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-400 mb-4">Nenhum processo encontrado</p>
              <Button variant="accent" onClick={openNewForm} className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar primeiro processo
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="text-muted bg-elevated uppercase text-xs border-b border-soft">
                    <tr>
                      <th className="px-4 py-3 text-center w-28">Acoes</th>
                      <th className="px-4 py-3 text-left">Processo</th>
                      <th className="px-4 py-3 text-left">Advogado</th>
                      <th className="px-4 py-3 text-left">Reclamante</th>
                      <th className="px-4 py-3 text-left">Tags</th>
                      <th className="px-4 py-3 text-left">Criado em</th>
                      <th className="px-4 py-3 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processes.map((item) => (
                      <tr key={item.id} className="border-b border-soft hover:bg-elevated">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={() => openEditForm(item.id)}
                              className="p-1 text-gray-300 hover:text-[#2563eb]"
                              title="Editar"
                              disabled={actionLoading}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1 text-gray-300 hover:text-red-400"
                              title="Excluir"
                              disabled={actionLoading}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white font-medium">#{item.id}</td>
                        <td className="px-4 py-3 text-gray-300">{item.requestingLawyerName || '-'}</td>
                        <td className="px-4 py-3 text-gray-300">{item.claimantName || '-'}</td>
                        <td className="px-4 py-3 text-gray-300">
                          {item.processTags.length
                            ? item.processTags.map((tagLink) => tagLink.tag.name).join(', ')
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <span className={`inline-flex items-center justify-center px-2 py-1 rounded text-xs font-medium ${statusClass(item.status)}`}>
                              {formatStatus(item.status)}
                            </span>
                            <select
                              value={item.status}
                              onChange={(event) => handleStatusChange(item.id, event.target.value as ProcessStatus)}
                              className="px-2 py-1 bg-background border border-soft rounded text-xs text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                              disabled={actionLoading}
                            >
                              {STATUS_OPTIONS.filter((option) => option.value !== '').map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-400">
                  Pagina {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPage((prev) => prev - 1)} disabled={!canGoPrevious() || loading}>
                    Anterior
                  </Button>
                  <Button variant="outline" onClick={() => setPage((prev) => prev + 1)} disabled={!canGoNext() || loading}>
                    Proxima
                  </Button>
                </div>
              </div>
            </>
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
