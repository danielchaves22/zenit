import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

type SourceType = 'EMAIL';
type DestinationType = 'PROCESS' | 'CLIENT' | 'OTHER' | '';

interface InboundImport {
  id: number;
  sourceType: SourceType;
  externalId: string;
  destinationType: Exclude<DestinationType, ''> | null;
  destinationId: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface InboundImportResponse {
  data: InboundImport[];
  total: number;
  pages: number;
  page: number;
  pageSize: number;
}

const DESTINATION_OPTIONS: Array<{ value: DestinationType; label: string }> = [
  { value: '', label: 'Sem destino' },
  { value: 'PROCESS', label: 'Processo' },
  { value: 'CLIENT', label: 'Cliente' },
  { value: 'OTHER', label: 'Outro' }
];

export default function ImportsPage() {
  const { addToast } = useToast();

  const [items, setItems] = useState<InboundImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const [searchFilter, setSearchFilter] = useState('');
  const [processedFilter, setProcessedFilter] = useState<'' | 'true' | 'false'>('');
  const [destinationFilter, setDestinationFilter] = useState<DestinationType>('');

  const [newExternalId, setNewExternalId] = useState('');
  const [newPayload, setNewPayload] = useState('');

  const [destinationByImportId, setDestinationByImportId] = useState<Record<number, DestinationType>>({});
  const [destinationIdByImportId, setDestinationIdByImportId] = useState<Record<number, string>>({});

  useEffect(() => {
    fetchImports(page, searchFilter, processedFilter, destinationFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function fetchImports(
    pageToFetch: number = page,
    searchToFetch: string = searchFilter,
    processedToFetch: '' | 'true' | 'false' = processedFilter,
    destinationToFetch: DestinationType = destinationFilter
  ) {
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = { page: pageToFetch, pageSize };
      if (searchToFetch.trim()) params.search = searchToFetch.trim();
      if (processedToFetch) params.processed = processedToFetch;
      if (destinationToFetch) params.destinationType = destinationToFetch;

      const response = await api.get<InboundImportResponse>('/inbound-imports', { params });
      const data = response.data.data || [];
      setItems(data);
      setTotalPages(response.data.pages || 1);

      const nextDestination: Record<number, DestinationType> = {};
      const nextDestinationId: Record<number, string> = {};
      data.forEach((item) => {
        nextDestination[item.id] = (item.destinationType || '') as DestinationType;
        nextDestinationId[item.id] = item.destinationId || '';
      });
      setDestinationByImportId(nextDestination);
      setDestinationIdByImportId(nextDestinationId);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Erro ao carregar importações.';
      setError(errorMessage);
      addToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  }

  function applyFilters() {
    setPage(1);
    fetchImports(1, searchFilter, processedFilter, destinationFilter);
  }

  function clearFilters() {
    setSearchFilter('');
    setProcessedFilter('');
    setDestinationFilter('');
    setPage(1);
    fetchImports(1, '', '', '');
  }

  async function handleCreateImport() {
    if (!newExternalId.trim()) {
      addToast('externalId é obrigatório.', 'error');
      return;
    }

    try {
      setActionLoading(true);

      let parsedPayload: any = undefined;
      if (newPayload.trim()) {
        try {
          parsedPayload = JSON.parse(newPayload);
        } catch {
          parsedPayload = newPayload;
        }
      }

      await api.post('/inbound-imports', {
        sourceType: 'EMAIL',
        externalId: newExternalId.trim(),
        payloadMetadata: parsedPayload
      });

      setNewExternalId('');
      setNewPayload('');
      addToast('Importação registrada com sucesso.', 'success');
      fetchImports(page, searchFilter, processedFilter, destinationFilter);
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao registrar importação.', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUpdateDestination(item: InboundImport) {
    const destinationType = destinationByImportId[item.id];
    const destinationId = destinationIdByImportId[item.id]?.trim();

    if (!destinationType) {
      addToast('Selecione um destinationType.', 'error');
      return;
    }

    if ((destinationType === 'PROCESS' || destinationType === 'CLIENT') && !destinationId) {
      addToast('destinationId é obrigatório para PROCESS e CLIENT.', 'error');
      return;
    }

    try {
      setActionLoading(true);
      await api.patch(`/inbound-imports/${item.id}/destination`, {
        destinationType,
        destinationId: destinationId || undefined
      });

      addToast('Destino atualizado com sucesso.', 'success');
      fetchImports(page, searchFilter, processedFilter, destinationFilter);
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao atualizar destino.', 'error');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Importações' }]} />

      <AccessGuard allowedRoles={['ADMIN', 'SUPERUSER', 'USER']}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Importações Técnicas</h1>
        </div>

        <Card className="mb-4">
          <h2 className="text-lg font-medium text-white mb-4">Registrar importação</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              label="externalId"
              value={newExternalId}
              onChange={(event) => setNewExternalId(event.target.value)}
              placeholder="ID externo da mensagem"
            />
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-300 mb-1">payloadMetadata (opcional)</label>
              <textarea
                value={newPayload}
                onChange={(event) => setNewPayload(event.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                placeholder='JSON ou texto livre'
              />
            </div>
          </div>
          <Button variant="accent" onClick={handleCreateImport} disabled={actionLoading}>
            Registrar
          </Button>
        </Card>

        <Card className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Input
              label="Busca"
              value={searchFilter}
              onChange={(event) => setSearchFilter(event.target.value)}
              placeholder="externalId ou destinationId"
            />

            <div>
              <label className="block text-sm text-gray-300 mb-1">Processado</label>
              <select
                value={processedFilter}
                onChange={(event) => setProcessedFilter(event.target.value as '' | 'true' | 'false')}
                className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              >
                <option value="">Todos</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-1">Destino</label>
              <select
                value={destinationFilter}
                onChange={(event) => setDestinationFilter(event.target.value as DestinationType)}
                className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              >
                {DESTINATION_OPTIONS.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <Button variant="accent" onClick={applyFilters} disabled={loading}>
                Filtrar
              </Button>
              <Button variant="outline" onClick={clearFilters} disabled={loading}>
                Limpar
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, index) => (
                <Skeleton key={index} className="h-12 w-full rounded bg-elevated" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <Button variant="outline" onClick={() => fetchImports(page, searchFilter, processedFilter, destinationFilter)}>
                Tentar novamente
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Nenhuma importação encontrada.</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="text-muted bg-elevated uppercase text-xs border-b border-soft">
                    <tr>
                      <th className="px-4 py-3 text-left">ID</th>
                      <th className="px-4 py-3 text-left">Origem</th>
                      <th className="px-4 py-3 text-left">External ID</th>
                      <th className="px-4 py-3 text-left">Destino</th>
                      <th className="px-4 py-3 text-left">Criado em</th>
                      <th className="px-4 py-3 text-left">Processado em</th>
                      <th className="px-4 py-3 text-left">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-soft hover:bg-elevated">
                        <td className="px-4 py-3 text-gray-200">#{item.id}</td>
                        <td className="px-4 py-3 text-gray-300">{item.sourceType}</td>
                        <td className="px-4 py-3 text-gray-300">{item.externalId}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-2">
                            <select
                              value={destinationByImportId[item.id] || ''}
                              onChange={(event) =>
                                setDestinationByImportId((prev) => ({
                                  ...prev,
                                  [item.id]: event.target.value as DestinationType
                                }))
                              }
                              className="px-2 py-1 bg-background border border-soft rounded text-xs text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                            >
                              {DESTINATION_OPTIONS.filter((opt) => opt.value !== '').map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <input
                              value={destinationIdByImportId[item.id] || ''}
                              onChange={(event) =>
                                setDestinationIdByImportId((prev) => ({
                                  ...prev,
                                  [item.id]: event.target.value
                                }))
                              }
                              className="px-2 py-1 bg-background border border-soft rounded text-xs text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
                              placeholder="destinationId"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{new Date(item.createdAt).toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-3 text-gray-300">
                          {item.processedAt ? new Date(item.processedAt).toLocaleString('pt-BR') : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="outline"
                            onClick={() => handleUpdateDestination(item)}
                            disabled={actionLoading}
                          >
                            Vincular
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-gray-400">
                  Página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setPage((prev) => prev - 1)} disabled={page <= 1 || loading}>
                    Anterior
                  </Button>
                  <Button variant="outline" onClick={() => setPage((prev) => prev + 1)} disabled={page >= totalPages || loading}>
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </AccessGuard>
    </DashboardLayout>
  );
}

