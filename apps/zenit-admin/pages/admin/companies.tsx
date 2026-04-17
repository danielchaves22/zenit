import React, { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { useToast } from '@/components/ui/ToastContext';
import { Plus, Building2, Edit2, Trash2, Save, X, KeyRound, FlaskConical } from 'lucide-react';
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

export default function CompaniesPage() {
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: ''
  });

  const [loadingOpenAi, setLoadingOpenAi] = useState(false);
  const [savingOpenAi, setSavingOpenAi] = useState(false);
  const [testingOpenAi, setTestingOpenAi] = useState(false);

  const [openAiStatus, setOpenAiStatus] = useState<AdminOpenAiStatusResponse | null>(null);
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiModel, setOpenAiModel] = useState('gpt-4o-mini');
  const [openAiPromptVersion, setOpenAiPromptVersion] = useState('v1');
  const [openAiEnabled, setOpenAiEnabled] = useState(true);

  useEffect(() => {
    void fetchCompanies();
  }, []);

  async function fetchCompanies() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/companies');
      setCompanies(response.data);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar empresas';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  function resetOpenAiState() {
    setOpenAiStatus(null);
    setOpenAiApiKey('');
    setOpenAiModel('gpt-4o-mini');
    setOpenAiPromptVersion('v1');
    setOpenAiEnabled(true);
  }

  async function loadOpenAiConfig(companyId: number) {
    setLoadingOpenAi(true);
    try {
      const response = await api.get<AdminOpenAiStatusResponse>(`/admin/companies/${companyId}/openai`);
      const data = response.data;
      setOpenAiStatus(data);

      if (data.credential) {
        setOpenAiModel(data.credential.model || 'gpt-4o-mini');
        setOpenAiPromptVersion(data.credential.promptVersion || 'v1');
        setOpenAiEnabled(data.credential.isActive);
      } else {
        setOpenAiModel('gpt-4o-mini');
        setOpenAiPromptVersion('v1');
        setOpenAiEnabled(true);
      }

      setOpenAiApiKey('');
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao carregar configuracao OpenAI da empresa.', 'error');
      resetOpenAiState();
    } finally {
      setLoadingOpenAi(false);
    }
  }

  function openNewForm() {
    setEditingCompany(null);
    setFormData({ name: '', address: '' });
    resetOpenAiState();
    setShowForm(true);
  }

  function openEditForm(company: Company) {
    setEditingCompany(company);
    setFormData({
      name: company.name,
      address: company.address || ''
    });
    setShowForm(true);
    void loadOpenAiConfig(company.id);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCompany(null);
    setFormData({ name: '', address: '' });
    resetOpenAiState();
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da empresa e obrigatorio', 'error');
      return;
    }

    setFormLoading(true);

    try {
      if (editingCompany) {
        const updateData = formData.address
          ? formData
          : { name: formData.name };

        await api.put(`/companies/${editingCompany.id}`, updateData);
        addToast('Empresa atualizada com sucesso', 'success');
      } else {
        await api.post('/companies', formData);
        addToast('Empresa criada com sucesso', 'success');
      }

      closeForm();
      await fetchCompanies();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar empresa', 'error');
    } finally {
      setFormLoading(false);
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
      addToast('Configuracao OpenAI da empresa salva com sucesso.', 'success');
      await loadOpenAiConfig(editingCompany.id);
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar configuracao OpenAI.', 'error');
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
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Falha no teste OpenAI.', 'error');
    } finally {
      setTestingOpenAi(false);
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

          if (editingCompany?.id === company.id) {
            closeForm();
          }

          await fetchCompanies();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir empresa', 'error');
          throw err;
        }
      }
    );
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: 'Inicio', href: '/' },
        { label: 'Empresas' }
      ]} />

      <AccessGuard allowedRoles={['ADMIN']}>
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-white">Empresas</h1>
          {showForm ? (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
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
                {formLoading
                  ? 'Salvando...'
                  : editingCompany
                    ? 'Salvar Alteracoes'
                    : 'Criar Empresa'}
              </Button>
            </div>
          ) : (
            <Button
              variant="accent"
              onClick={openNewForm}
              className="flex items-center gap-2"
              disabled={formLoading}
            >
              <Plus size={16} />
              Nova Empresa
            </Button>
          )}
        </div>

        {showForm && (
          <Card className="mb-6 border-2 border-[#2563eb]">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white">
                {editingCompany ? `Editando: ${editingCompany.name}` : 'Nova Empresa'}
              </h3>

              <Input
                label="Nome da Empresa"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="Ex: Minha Empresa Ltda"
                disabled={formLoading}
              />

              <Input
                label="Endereco"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Ex: Rua das Flores, 123 - Centro"
                disabled={formLoading}
              />

              {editingCompany && (
                <div className="pt-6 mt-2 border-t border-gray-700">
                  <div className="flex items-center gap-2 mb-4">
                    <KeyRound size={16} className="text-[#2563eb]" />
                    <h4 className="text-base font-medium text-white">Configuracoes Internas (Plataforma)</h4>
                  </div>

                  {loadingOpenAi ? (
                    <div className="text-sm text-gray-300">Carregando configuracao OpenAI...</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <Input
                          label="Chave API OpenAI"
                          type="password"
                          placeholder={openAiStatus?.configured ? '******** (manter atual se vazio)' : 'sk-...'}
                          value={openAiApiKey}
                          onChange={(event) => setOpenAiApiKey(event.target.value)}
                          disabled={savingOpenAi || testingOpenAi}
                        />

                        <Input
                          label="Modelo"
                          value={openAiModel}
                          onChange={(event) => setOpenAiModel(event.target.value)}
                          placeholder="gpt-4o-mini"
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
                          <label className="block text-sm text-gray-300 mb-1">Ativa</label>
                          <select
                            value={openAiEnabled ? 'true' : 'false'}
                            onChange={(event) => setOpenAiEnabled(event.target.value === 'true')}
                            className="w-full px-3 py-2 bg-background border border-soft rounded text-base-color"
                            disabled={savingOpenAi || testingOpenAi}
                          >
                            <option value="true">Sim</option>
                            <option value="false">Nao</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <Button
                          type="button"
                          variant="accent"
                          onClick={saveOpenAiConfig}
                          disabled={savingOpenAi || formLoading}
                          className="flex items-center gap-2"
                        >
                          <Save size={16} />
                          {savingOpenAi ? 'Salvando OpenAI...' : 'Salvar OpenAI'}
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={testOpenAiConfig}
                          disabled={testingOpenAi || formLoading}
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
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-4 pt-6 border-t border-gray-700">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeForm}
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
                  {formLoading
                    ? 'Salvando...'
                    : editingCompany
                      ? 'Salvar Alteracoes'
                      : 'Criar Empresa'
                  }
                </Button>
              </div>
            </div>
          </Card>
        )}

        <Card>
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded bg-[#1e2126]" />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-10">
              <div className="text-red-400 mb-4">{error}</div>
              <Button variant="outline" onClick={() => void fetchCompanies()}>
                Tentar Novamente
              </Button>
            </div>
          ) : companies.length === 0 ? (
            <div className="text-center py-10">
              <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
              <p className="text-gray-400 mb-4">Nenhuma empresa cadastrada</p>
              <Button
                variant="accent"
                onClick={openNewForm}
                className="inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Criar Primeira Empresa
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-center w-24">Acoes</th>
                    <th className="px-4 py-3 text-left">Codigo</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Endereco</th>
                    <th className="px-4 py-3 text-left">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr
                      key={company.id}
                      className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${
                        editingCompany?.id === company.id
                          ? 'bg-[#2563eb]/10 border-[#2563eb]/30'
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => openEditForm(company)}
                            className="p-1 text-gray-300 hover:text-[#2563eb] transition-colors"
                            title="Editar"
                            disabled={formLoading}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => void handleDelete(company)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                            title="Excluir"
                            disabled={formLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-[#2563eb] font-medium">
                          {company.code.toString().padStart(3, '0')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Building2 size={16} className="text-blue-400" />
                          <span className="font-medium text-white">{company.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-300">
                        {company.address || '-'}
                      </td>
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
