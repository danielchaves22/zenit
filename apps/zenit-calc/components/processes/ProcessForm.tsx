import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import TagMultiSelectAutocomplete, { TagOption } from '@/components/ui/TagMultiSelectAutocomplete';
import { Save, X, Plus } from 'lucide-react';
import api from '@/lib/api';

type ProcessStatus = 'SOLICITACAO' | 'INICIAL' | 'CALCULO';
type ProcessOriginType = 'MANUAL' | 'IMPORT';

interface ProcessTag extends TagOption {
  usageCount?: number;
}

interface ProcessStatusHistoryItem {
  id: number;
  fromStatus: ProcessStatus | null;
  toStatus: ProcessStatus;
  reason: string | null;
  changedAt: string;
  changedByUser: {
    id: number;
    name: string;
    email: string;
  };
}

interface ProcessResponse {
  id: number;
  status: ProcessStatus;
  requestingLawyerName: string | null;
  claimantName: string | null;
  notes: string | null;
  originType: ProcessOriginType;
  sourceImportId: number | null;
  processTags: Array<{ tag: ProcessTag }>;
  statusHistory: ProcessStatusHistoryItem[];
}

interface ProcessFormProps {
  mode: 'create' | 'edit';
  processId?: string | number;
}

interface FormData {
  status: ProcessStatus;
  requestingLawyerName: string;
  claimantName: string;
  notes: string;
  sourceImportId: string;
}

const STATUS_OPTIONS: Array<{ value: ProcessStatus; label: string }> = [
  { value: 'SOLICITACAO', label: 'Solicitacao' },
  { value: 'INICIAL', label: 'Inicial' },
  { value: 'CALCULO', label: 'Calculo' }
];

function formatStatus(status: ProcessStatus | null): string {
  if (!status) return '-';
  if (status === 'SOLICITACAO') return 'Solicitacao';
  if (status === 'INICIAL') return 'Inicial';
  return 'Calculo';
}

export function ProcessForm({ mode, processId }: ProcessFormProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const isEdit = mode === 'edit';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    status: 'SOLICITACAO',
    requestingLawyerName: '',
    claimantName: '',
    notes: '',
    sourceImportId: ''
  });

  const [selectedTags, setSelectedTags] = useState<ProcessTag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [history, setHistory] = useState<ProcessStatusHistoryItem[]>([]);

  useEffect(() => {
    if (isEdit && (processId === undefined || processId === null)) return;
    void loadFormData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, processId]);

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

  async function loadFormData() {
    setLoading(true);
    setError(null);

    try {
      if (isEdit) {
        const id = Number(processId);
        if (isNaN(id)) {
          setError('ID de processo invalido.');
          setLoading(false);
          return;
        }

        const processResponse = await api.get<ProcessResponse>(`/processes/${id}`);
        const process = processResponse.data;

        setFormData({
          status: process.status,
          requestingLawyerName: process.requestingLawyerName || '',
          claimantName: process.claimantName || '',
          notes: process.notes || '',
          sourceImportId: process.sourceImportId ? String(process.sourceImportId) : ''
        });

        setSelectedTags(process.processTags.map((item) => item.tag));
        setHistory(process.statusHistory || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao carregar dados do formulario.');
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    router.push('/processes');
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;

    try {
      const response = await api.post('/process-tags', { name });
      const createdTag: ProcessTag = response.data;
      setSelectedTags((prev) => {
        if (prev.some((item) => item.id === createdTag.id)) return prev;
        return [...prev, createdTag];
      });
      setNewTagName('');
      addToast('Tag criada com sucesso.', 'success');
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao criar tag.', 'error');
    }
  }

  async function handleSubmit() {
    setFormLoading(true);

    try {
      const basePayload = {
        status: formData.status,
        requestingLawyerName: formData.requestingLawyerName.trim() || undefined,
        claimantName: formData.claimantName.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        sourceImportId: formData.sourceImportId.trim() ? Number(formData.sourceImportId) : undefined,
        tagIds: selectedTags.map((tag) => tag.id)
      };

      if (isEdit) {
        await api.put(`/processes/${processId}`, basePayload);
        addToast('Processo atualizado com sucesso.', 'success');
      } else {
        await api.post('/processes', { ...basePayload, originType: 'MANUAL' as ProcessOriginType });
        addToast('Processo criado com sucesso.', 'success');
      }

      router.push('/processes');
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar processo.', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <div className="space-y-3">
          {[...Array(8)].map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded bg-elevated" />
          ))}
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-10">
          <div className="text-red-400 mb-4">{error}</div>
          <Button variant="outline" onClick={handleCancel}>
            Voltar
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">
          {isEdit ? 'Editar processo' : 'Novo processo'}
        </h1>
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={formLoading}
            className="flex items-center gap-2"
          >
            <X size={16} />
            Cancelar
          </Button>
          <Button
            variant="accent"
            onClick={handleSubmit}
            disabled={formLoading}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {formLoading ? 'Salvando...' : isEdit ? 'Salvar alteracoes' : 'Criar processo'}
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Status</label>
            <select
              value={formData.status}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, status: event.target.value as ProcessStatus }))
              }
              className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Advogado solicitante"
            value={formData.requestingLawyerName}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, requestingLawyerName: event.target.value }))
            }
          />

          <Input
            label="Reclamante"
            value={formData.claimantName}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, claimantName: event.target.value }))
            }
          />

          <Input
            label="ID da importacao de origem (opcional)"
            value={formData.sourceImportId}
            onChange={(event) =>
              setFormData((prev) => ({ ...prev, sourceImportId: event.target.value }))
            }
            placeholder="Ex: 123"
          />

          <div className="md:col-span-2">
            <label className="block text-sm text-gray-300 mb-1">Observacoes</label>
            <textarea
              value={formData.notes}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, notes: event.target.value }))
              }
              rows={4}
              className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              placeholder="Observacoes gerais sobre o processo"
            />
          </div>
        </div>
      </Card>

      <Card className="mb-6 overflow-visible">
        <h2 className="text-lg font-medium text-white mb-4">Tags do processo</h2>

        <div className="flex gap-2 mb-4">
          <Input
            className="flex-1 mb-0"
            placeholder="Nova tag"
            value={newTagName}
            onChange={(event) => setNewTagName(event.target.value)}
          />
          <Button
            variant="outline"
            onClick={handleCreateTag}
            className="h-[34px] flex items-center gap-2"
            disabled={!newTagName.trim()}
          >
            <Plus size={14} />
            Criar
          </Button>
        </div>

        <TagMultiSelectAutocomplete
          id="process-tags"
          label="Selecionar tags"
          selectedOptions={selectedTags}
          onSelectedOptionsChange={(options) => setSelectedTags(options as ProcessTag[])}
          fetchOptions={fetchTagOptions}
          placeholder="Digite para buscar e adicionar tags"
          emptyMessage="Nenhuma tag disponivel."
        />
      </Card>

      {isEdit && (
        <Card>
          <h2 className="text-lg font-medium text-white mb-4">Historico de status</h2>

          {history.length === 0 ? (
            <p className="text-gray-400">Sem historico registrado.</p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="border border-soft rounded p-3 bg-elevated">
                  <div className="text-sm text-gray-200">
                    <span className="font-medium">{formatStatus(item.fromStatus)}</span>
                    {' -> '}
                    <span className="font-medium text-accent">{formatStatus(item.toStatus)}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(item.changedAt).toLocaleString('pt-BR')} por {item.changedByUser?.name || 'Usuario'}
                  </div>
                  {item.reason && <div className="text-sm text-gray-300 mt-2">{item.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

export default ProcessForm;
