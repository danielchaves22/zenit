import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, FlaskConical, KeyRound, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';

interface Company {
  id: number;
  name: string;
  address?: string;
  code: number;
  createdAt: string;
  updatedAt: string;
}

interface AdminOpenAiStatusResponse {
  configured: boolean;
  credential: {
    id: number;
    provider: 'OPENAI';
    model: string;
    promptVersion: string;
    isActive: boolean;
    updatedAt: string;
    createdAt: string;
  } | null;
}

interface CompanyFormProps {
  mode: 'create' | 'edit';
  companyId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const DEFAULT_OPENAI_MODEL = 'gpt-5.4-nano';

export default function CompanyForm({
  mode,
  companyId,
  onSuccess,
  onCancel
}: CompanyFormProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    address: ''
  });

  const [loadingOpenAi, setLoadingOpenAi] = useState(false);
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [testingOpenAi, setTestingOpenAi] = useState(false);

  const [openAiStatus, setOpenAiStatus] = useState<AdminOpenAiStatusResponse | null>(null);
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiModel, setOpenAiModel] = useState(DEFAULT_OPENAI_MODEL);
  const [openAiPromptVersion, setOpenAiPromptVersion] = useState('v1');
  const [openAiEnabled, setOpenAiEnabled] = useState(true);

  useEffect(() => {
    if (mode === 'edit' && companyId) {
      void initializeEdit(companyId);
    }
  }, [companyId, mode]);

  function resetOpenAiState() {
    setOpenAiStatus(null);
    setOpenAiApiKey('');
    setOpenAiModel(DEFAULT_OPENAI_MODEL);
    setOpenAiPromptVersion('v1');
    setOpenAiEnabled(true);
  }

  async function initializeEdit(id: string) {
    setLoading(true);

    try {
      const response = await api.get('/companies');
      const companies = (response.data || []) as Company[];
      const company = companies.find((item) => item.id.toString() === id);

      if (!company) {
        addToast('Empresa nao encontrada', 'error');
        handleCancel();
        return;
      }

      setEditingCompany(company);
      setFormData({
        name: company.name,
        address: company.address || ''
      });

      await loadOpenAiConfig(company.id);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar empresa', 'error');
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  async function loadOpenAiConfig(targetCompanyId: number) {
    setLoadingOpenAi(true);
    try {
      const response = await api.get<AdminOpenAiStatusResponse>(
        `/admin/companies/${targetCompanyId}/openai`
      );
      const data = response.data;
      setOpenAiStatus(data);

      if (data.credential) {
        setOpenAiModel(data.credential.model || DEFAULT_OPENAI_MODEL);
        setOpenAiPromptVersion(data.credential.promptVersion || 'v1');
        setOpenAiEnabled(data.credential.isActive);
      } else {
        setOpenAiModel(DEFAULT_OPENAI_MODEL);
        setOpenAiPromptVersion('v1');
        setOpenAiEnabled(true);
      }

      setOpenAiApiKey('');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar configuracao OpenAI.', 'error');
      resetOpenAiState();
    } finally {
      setLoadingOpenAi(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.push('/admin/companies');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!formData.name.trim()) {
      addToast('Nome da empresa e obrigatorio', 'error');
      return;
    }

    setSaving(true);

    try {
      if (mode === 'create') {
        await api.post('/companies', formData);
        addToast('Empresa criada com sucesso', 'success');
      } else {
        const payload = formData.address ? formData : { name: formData.name };
        await api.put(`/companies/${companyId}`, payload);
        addToast('Empresa atualizada com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/companies');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar empresa', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveOpenAiConfig() {
    if (!editingCompany) return;

    if (!openAiApiKey.trim() && !openAiStatus?.configured) {
      addToast('Informe a chave OpenAI para salvar a primeira configuracao.', 'error');
      return;
    }

    try {
      setSavingOpenAi(true);
      await api.put(`/admin/companies/${editingCompany.id}/openai`, {
        apiKey: openAiApiKey.trim() || undefined,
        model: openAiModel,
        promptVersion: openAiPromptVersion,
        isActive: openAiEnabled
      });

      setOpenAiApiKey('');
      addToast('Configuracao OpenAI salva com sucesso.', 'success');
      await loadOpenAiConfig(editingCompany.id);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar configuracao OpenAI.', 'error');
    } finally {
      setSavingOpenAi(false);
    }
  }

  async function testOpenAiConfig() {
    if (!editingCompany) return;

    try {
      setTestingOpenAi(true);
      const response = await api.post(`/admin/companies/${editingCompany.id}/openai/test`, {
        apiKey: openAiApiKey.trim() || undefined,
        model: openAiModel
      });

      if (response.data?.ok) {
        addToast('Teste OpenAI executado com sucesso.', 'success');
      } else {
        addToast(response.data?.error || 'Falha no teste OpenAI.', 'error');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Falha no teste OpenAI.', 'error');
    } finally {
      setTestingOpenAi(false);
    }
  }

  if (loading) {
    return <PageLoader message="Carregando empresa..." />;
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            className="flex items-center gap-2"
            disabled={saving}
          >
            <ArrowLeft size={16} />
            Voltar
          </Button>
          <h1 className="text-2xl font-semibold text-white">
            {mode === 'create' ? 'Nova Empresa' : 'Editar Empresa'}
          </h1>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
            className="flex items-center gap-2"
          >
            <X size={16} />
            Cancelar
          </Button>
          <Button
            type="submit"
            form="company-form"
            variant="accent"
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving
              ? 'Salvando...'
              : mode === 'create'
                ? 'Criar Empresa'
                : 'Salvar Alteracoes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_340px]">
        <Card>
          <form id="company-form" onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Nome da Empresa"
              value={formData.name}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, name: event.target.value }))
              }
              required
              placeholder="Ex: Minha Empresa Ltda"
              disabled={saving}
            />

            <Input
              label="Endereco"
              value={formData.address}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, address: event.target.value }))
              }
              placeholder="Ex: Rua das Flores, 123 - Centro"
              disabled={saving}
            />

            {editingCompany && (
              <div className="border-t border-gray-700 pt-6">
                <div className="mb-4 flex items-center gap-2">
                  <KeyRound size={16} className="text-[#2563eb]" />
                  <h2 className="text-base font-medium text-white">
                    Configuracoes Internas (Plataforma)
                  </h2>
                </div>

                {loadingOpenAi ? (
                  <div className="text-sm text-gray-300">Carregando configuracao OpenAI...</div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Input
                        label="Chave API OpenAI"
                        type="password"
                        placeholder={
                          openAiStatus?.configured
                            ? '******** (manter atual se vazio)'
                            : 'sk-...'
                        }
                        value={openAiApiKey}
                        onChange={(event) => setOpenAiApiKey(event.target.value)}
                        disabled={savingOpenAi || testingOpenAi}
                      />

                      <Input
                        label="Modelo"
                        value={openAiModel}
                        onChange={(event) => setOpenAiModel(event.target.value)}
                        placeholder={DEFAULT_OPENAI_MODEL}
                        disabled={savingOpenAi || testingOpenAi}
                      />

                      <Input
                        label="Versao do Prompt"
                        value={openAiPromptVersion}
                        onChange={(event) => setOpenAiPromptVersion(event.target.value)}
                        placeholder="v1"
                        disabled={savingOpenAi || testingOpenAi}
                      />

                      <div>
                        <label className="mb-1 block text-sm text-gray-300">Ativa</label>
                        <select
                          value={openAiEnabled ? 'true' : 'false'}
                          onChange={(event) => setOpenAiEnabled(event.target.value === 'true')}
                          className="w-full rounded border border-soft bg-background px-3 py-2 text-base-color"
                          disabled={savingOpenAi || testingOpenAi}
                        >
                          <option value="true">Sim</option>
                          <option value="false">Nao</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="accent"
                        onClick={saveOpenAiConfig}
                        disabled={savingOpenAi || saving}
                        className="flex items-center gap-2"
                      >
                        <Save size={16} />
                        {savingOpenAi ? 'Salvando OpenAI...' : 'Salvar OpenAI'}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={testOpenAiConfig}
                        disabled={testingOpenAi || saving}
                        className="flex items-center gap-2"
                      >
                        <FlaskConical size={16} />
                        {testingOpenAi ? 'Testando...' : 'Testar Credencial'}
                      </Button>
                    </div>

                    <div className="text-sm text-gray-400">
                      Status: {openAiStatus?.configured ? 'Configurada' : 'Nao configurada'}
                      {openAiStatus?.credential
                        ? ` | Atualizada em ${new Date(openAiStatus.credential.updatedAt).toLocaleString('pt-BR')}`
                        : ''}
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </Card>

        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Resumo</div>
              <div className="mt-1 text-sm text-gray-400">
                {mode === 'create'
                  ? 'A empresa sera criada e ficara disponivel para vinculacao de usuarios.'
                  : 'Ajuste os dados cadastrais e as configuracoes internas da plataforma.'}
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Nome</div>
              <div className="mt-2 text-xl font-semibold text-white">
                {formData.name || '-'}
              </div>
            </div>

            {editingCompany && (
              <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Codigo</div>
                <div className="mt-2 text-xl font-semibold text-white">
                  {editingCompany.code.toString().padStart(3, '0')}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Endereco</div>
              <div className="mt-2 text-sm text-white">
                {formData.address || 'Nao informado'}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
