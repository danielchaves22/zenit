import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Landmark, Save, X } from 'lucide-react';
import BankIconPreview from '@/components/admin/BankIconPreview';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import api from '@/lib/api';
import { AdminBank, BankIconOption } from '@/utils/banks';

interface BankFormProps {
  mode: 'create' | 'edit';
  bankId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function BankForm({ mode, bankId, onSuccess, onCancel }: BankFormProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingBank, setEditingBank] = useState<AdminBank | null>(null);
  const [iconOptions, setIconOptions] = useState<BankIconOption[]>([]);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    iconSlug: '',
    displayOrder: '0',
    isActive: true
  });

  useEffect(() => {
    void initializeForm();
  }, [bankId, mode]);

  const selectedIconOption = useMemo(
    () => iconOptions.find((option) => option.value === formData.iconSlug) || null,
    [formData.iconSlug, iconOptions]
  );

  async function initializeForm() {
    setLoading(true);

    try {
      const requests: Promise<any>[] = [api.get('/admin/banks/icon-options')];

      if (mode === 'edit' && bankId) {
        requests.push(api.get(`/admin/banks/${bankId}`));
      }

      const [iconsResponse, bankResponse] = await Promise.all(requests);
      const nextIconOptions = (iconsResponse.data || []) as BankIconOption[];
      setIconOptions(nextIconOptions);

      if (mode === 'edit' && bankId) {
        const bank = bankResponse?.data as AdminBank;
        setEditingBank(bank);
        setFormData({
          code: bank.code,
          name: bank.name,
          iconSlug: bank.iconSlug,
          displayOrder: String(bank.displayOrder ?? 0),
          isActive: bank.isActive
        });
      } else {
        setEditingBank(null);
        setFormData((previous) => ({
          ...previous,
          iconSlug: previous.iconSlug || nextIconOptions[0]?.value || ''
        }));
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar banco', 'error');
      if (mode === 'edit') {
        handleCancel();
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.push('/admin/banks');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!formData.code.trim()) {
      addToast('Codigo do banco e obrigatorio', 'error');
      return;
    }

    if (!formData.name.trim()) {
      addToast('Nome do banco e obrigatorio', 'error');
      return;
    }

    if (!formData.iconSlug) {
      addToast('Selecione um icone para o banco', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        iconSlug: formData.iconSlug,
        displayOrder: Number(formData.displayOrder || 0),
        isActive: formData.isActive
      };

      if (mode === 'create') {
        await api.post('/admin/banks', payload);
        addToast('Banco criado com sucesso', 'success');
      } else {
        await api.put(`/admin/banks/${bankId}`, payload);
        addToast('Banco atualizado com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/admin/banks');
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar banco', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <PageLoader message="Carregando banco..." />;
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
            {mode === 'create' ? 'Novo Banco' : 'Editar Banco'}
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
            form="bank-form"
            variant="accent"
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar Banco' : 'Salvar Alteracoes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_340px]">
        <Card>
          <form id="bank-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-[#2563eb]/30 bg-[#2563eb]/10 p-4">
              <div className="flex items-start gap-3">
                <Landmark size={18} className="mt-0.5 text-[#60a5fa]" />
                <div>
                  <div className="font-medium text-white">Catalogo global de bancos</div>
                  <div className="mt-1 text-sm text-gray-300">
                    O cadastro e unico para toda a plataforma. O Zenit Cash consome este
                    catalogo no dropdown de cartoes de credito.
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Codigo"
                value={formData.code}
                onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                placeholder="Ex: ITAU"
                disabled={saving}
                required
              />
              <Input
                label="Nome"
                value={formData.name}
                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                placeholder="Ex: Itau"
                disabled={saving}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Icone SVG</label>
                <select
                  value={formData.iconSlug}
                  onChange={(event) =>
                    setFormData({ ...formData, iconSlug: event.target.value })
                  }
                  className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-[#2563eb] focus:outline-none focus:ring"
                  disabled={saving}
                >
                  {iconOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 text-xs text-gray-400">
                  Os SVGs ficam versionados no repositorio e o banco salva apenas o slug do icone.
                </div>
              </div>

              <Input
                label="Ordem de exibicao"
                type="number"
                min="0"
                value={formData.displayOrder}
                onChange={(event) =>
                  setFormData({ ...formData, displayOrder: event.target.value })
                }
                disabled={saving}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="bank-is-active"
                type="checkbox"
                checked={formData.isActive}
                onChange={(event) =>
                  setFormData({ ...formData, isActive: event.target.checked })
                }
                className="h-4 w-4 rounded border-gray-700 bg-background text-[#2563eb] focus:ring-[#2563eb]"
                disabled={saving}
              />
              <label htmlFor="bank-is-active" className="text-sm text-gray-300">
                Banco ativo
              </label>
            </div>
          </form>
        </Card>

        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Preview do banco</div>
              <div className="mt-1 text-sm text-gray-400">
                O mesmo icone sera usado no cadastro e na listagem de cartoes no Zenit Cash.
              </div>
            </div>

            <div className="rounded-xl border border-gray-700 bg-[#10151d] p-5">
              <div className="flex items-center gap-4">
                <BankIconPreview
                  iconPath={selectedIconOption?.iconPath}
                  label={formData.name || selectedIconOption?.label}
                  size="lg"
                />
                <div>
                  <div className="text-base font-semibold text-white">
                    {formData.name.trim() || 'Nome do banco'}
                  </div>
                  <div className="mt-1 font-mono text-sm text-[#60a5fa]">
                    {formData.code.trim() || 'CODIGO'}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#10151d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Icone selecionado</div>
              <div className="mt-2 text-sm text-white">
                {selectedIconOption?.label || 'Nenhum icone selecionado'}
              </div>
              <div className="mt-1 font-mono text-xs text-gray-400">
                {selectedIconOption?.value || '-'}
              </div>
            </div>

            {editingBank && (
              <div className="rounded-lg border border-gray-700 bg-[#10151d] p-4">
                <div className="text-xs uppercase tracking-wide text-gray-400">Cartoes vinculados</div>
                <div className="mt-2 text-2xl font-semibold text-white">
                  {editingBank.linkedAccountsCount || 0}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
