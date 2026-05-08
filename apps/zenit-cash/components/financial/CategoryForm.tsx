import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import CategoryIconPicker from '@/components/financial/CategoryIconPicker';
import CategorySelect from '@/components/financial/CategorySelect';
import api from '@/lib/api';
import {
  CategoryIcon,
  DEFAULT_CATEGORY_ICON,
  getCategoryIconLabel
} from '@/utils/categoryIcons';

interface Category {
  id: number;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  color: string;
  icon: string;
  isDefault: boolean;
  parentId?: number;
  parent?: { id: number; name: string };
  accountingCode?: string;
}

interface CategoryFormProps {
  mode: 'create' | 'edit';
  categoryId?: string;
  initialType?: 'INCOME' | 'EXPENSE';
  onSuccess?: () => void;
  onCancel?: () => void;
}

function normalizeCategoryType(value?: string): 'INCOME' | 'EXPENSE' {
  return value === 'INCOME' ? 'INCOME' : 'EXPENSE';
}

export default function CategoryForm({
  mode,
  categoryId,
  initialType = 'EXPENSE',
  onSuccess,
  onCancel
}: CategoryFormProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: normalizeCategoryType(initialType),
    color: '#6366F1',
    icon: DEFAULT_CATEGORY_ICON,
    parentId: '',
    accountingCode: ''
  });

  useEffect(() => {
    void initialize();
  }, [categoryId, initialType, mode]);

  async function initialize() {
    setLoading(true);

    try {
      const response = await api.get('/financial/categories');
      const loadedCategories = response.data || [];
      setCategories(loadedCategories);

      if (mode === 'edit') {
        const category = loadedCategories.find(
          (item: Category) => item.id.toString() === categoryId
        );

        if (!category) {
          addToast('Categoria nao encontrada', 'error');
          handleCancel();
          return;
        }

        setEditingCategory(category);
        setFormData({
          name: category.name,
          type: normalizeCategoryType(category.type),
          color: category.color,
          icon: category.icon || DEFAULT_CATEGORY_ICON,
          parentId: category.parentId?.toString() || '',
          accountingCode: category.accountingCode || ''
        });
      } else {
        setEditingCategory(null);
        setFormData({
          name: '',
          type: normalizeCategoryType(initialType),
          color: '#6366F1',
          icon: DEFAULT_CATEGORY_ICON,
          parentId: '',
          accountingCode: ''
        });
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar categorias', 'error');
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  function buildReturnHref(type: 'INCOME' | 'EXPENSE') {
    return {
      pathname: '/financial/categories',
      query: { type }
    };
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }

    router.push(buildReturnHref(formData.type));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!formData.name.trim()) {
      addToast('Nome da categoria e obrigatorio', 'error');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...formData,
        parentId: formData.parentId ? parseInt(formData.parentId, 10) : null
      };

      if (mode === 'create') {
        await api.post('/financial/categories', payload);
        addToast('Categoria criada com sucesso', 'success');
      } else {
        await api.put(`/financial/categories/${categoryId}`, payload);
        addToast('Categoria atualizada com sucesso', 'success');
      }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push(buildReturnHref(formData.type));
      }
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar categoria', 'error');
    } finally {
      setSaving(false);
    }
  }

  const availableParentCategories = useMemo(
    () =>
      categories.filter(
        (category) =>
          category.type === formData.type &&
          !category.parentId &&
          category.id !== editingCategory?.id
      ),
    [categories, editingCategory?.id, formData.type]
  );

  if (loading) {
    return <PageLoader message="Carregando categoria..." />;
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
            {mode === 'create'
              ? `Nova Categoria de ${formData.type === 'EXPENSE' ? 'Despesa' : 'Receita'}`
              : 'Editar Categoria'}
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
            form="category-form"
            variant="accent"
            disabled={saving}
            className="flex items-center gap-2"
          >
            <Save size={16} />
            {saving ? 'Salvando...' : mode === 'create' ? 'Criar Categoria' : 'Salvar Alteracoes'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
        <Card>
          <form id="category-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label="Nome da Categoria"
                value={formData.name}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, name: event.target.value }))
                }
                required
                placeholder="Ex: Alimentacao, Vendas, Marketing..."
                disabled={saving}
              />

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Tipo</label>
                <select
                  value={formData.type}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      type: normalizeCategoryType(event.target.value),
                      parentId: ''
                    }))
                  }
                  className="w-full rounded border border-gray-700 bg-[#1e2126] px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
                  disabled={saving}
                >
                  <option value="EXPENSE">Despesa</option>
                  <option value="INCOME">Receita</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Cor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, color: event.target.value }))
                    }
                    className="h-10 w-12 cursor-pointer rounded border border-gray-700"
                    disabled={saving}
                  />
                  <Input
                    value={formData.color}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, color: event.target.value }))
                    }
                    placeholder="#6366F1"
                    className="mb-0 flex-1"
                    disabled={saving}
                  />
                </div>
              </div>

              <Input
                label="Codigo Contabil (opcional)"
                value={formData.accountingCode}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    accountingCode: event.target.value
                  }))
                }
                placeholder="Ex: 1.1.001"
                className="mb-0"
                disabled={saving}
              />
            </div>

            <CategorySelect
              label="Categoria Pai (opcional)"
              categories={availableParentCategories}
              value={formData.parentId}
              onChange={(parentId) => setFormData((prev) => ({ ...prev, parentId }))}
              placeholder="Nenhuma (categoria principal)"
              emptyLabel="Nenhuma (categoria principal)"
              disabled={saving}
            />

            <CategoryIconPicker
              value={formData.icon}
              onChange={(icon) => setFormData((prev) => ({ ...prev, icon }))}
              color={formData.color}
              disabled={saving}
            />
          </form>
        </Card>

        <Card>
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-white">Resumo</div>
              <div className="mt-1 text-sm text-gray-400">
                Categorias ajudam a classificar lancamentos e podem ser definidas como padrao na
                listagem.
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Pre-visualizacao</div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-[#0f1419]">
                  <CategoryIcon icon={formData.icon} size={18} color={formData.color} />
                </div>
                <div className="text-white">
                  {formData.name.trim() || 'Nome da categoria'}
                  <div className="text-xs text-gray-400">{getCategoryIconLabel(formData.icon)}</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-700 bg-[#11161d] p-4">
              <div className="text-xs uppercase tracking-wide text-gray-400">Estrutura</div>
              <div className="mt-2 text-sm text-gray-300">
                {formData.parentId
                  ? 'Subcategoria vinculada a uma categoria principal.'
                  : 'Categoria principal, disponivel para receber subcategorias.'}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
