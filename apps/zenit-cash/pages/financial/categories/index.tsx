import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { InfoModalButton } from '@/components/ui/InfoModalButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { PageGuard } from '@/components/ui/AccessGuard';
import {
  Edit2,
  Plus,
  Star,
  StarOff,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import api from '@/lib/api';
import { CategoryIcon } from '@/utils/categoryIcons';

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
  _count?: { children: number };
}

function CategoriesPageInner() {
  const router = useRouter();
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');

  const queryType = router.query.type === 'INCOME' ? 'INCOME' : 'EXPENSE';

  useEffect(() => {
    setActiveTab(queryType);
  }, [queryType]);

  useEffect(() => {
    void fetchCategories();
  }, []);

  async function fetchCategories() {
    setLoading(true);
    setError(null);

    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data || []);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar categorias';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  function changeActiveTab(nextTab: 'INCOME' | 'EXPENSE') {
    setActiveTab(nextTab);
    router.replace(
      {
        pathname: '/financial/categories',
        query: { type: nextTab }
      },
      undefined,
      { shallow: true }
    );
  }

  async function handleSetDefault(category: Category) {
    if (category.isDefault) {
      confirmation.confirm(
        {
          title: 'Remover Categoria Padrão',
          message: `Tem certeza que deseja remover "${category.name}" como categoria padrão para ${
            category.type === 'EXPENSE' ? 'despesas' : 'receitas'
          }?`,
          confirmText: 'Remover Padrão',
          cancelText: 'Cancelar',
          type: 'warning'
        },
        async () => {
          try {
            await api.delete(`/financial/categories/${category.id}/set-default`);
            addToast('Categoria padrão removida com sucesso', 'success');
            await fetchCategories();
          } catch (error: any) {
            addToast(error.response?.data?.error || 'Erro ao remover categoria padrão', 'error');
            throw error;
          }
        }
      );
      return;
    }

    const currentDefault = categories.find(
      (item) => item.isDefault && item.type === category.type
    );
    const typeLabel = category.type === 'EXPENSE' ? 'despesas' : 'receitas';
    const message = currentDefault
      ? `Definir "${category.name}" como categoria padrão para ${typeLabel}? A categoria "${currentDefault.name}" deixará de ser padrão.`
      : `Definir "${category.name}" como categoria padrão para ${typeLabel}?`;

    confirmation.confirm(
      {
        title: 'Definir Categoria Padrão',
        message,
        confirmText: 'Definir como Padrão',
        cancelText: 'Cancelar',
        type: 'info'
      },
      async () => {
        try {
          await api.post(`/financial/categories/${category.id}/set-default`);
          addToast('Categoria definida como padrão com sucesso', 'success');
          await fetchCategories();
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao definir categoria padrão', 'error');
          throw error;
        }
      }
    );
  }

  async function handleDelete(category: Category) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir a categoria "${category.name}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/categories/${category.id}`);
          addToast('Categoria excluída com sucesso', 'success');
          await fetchCategories();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir categoria', 'error');
          throw err;
        }
      }
    );
  }

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === activeTab),
    [activeTab, categories]
  );
  const parentCategories = useMemo(
    () => filteredCategories.filter((category) => !category.parentId),
    [filteredCategories]
  );
  const childCategories = useMemo(
    () => filteredCategories.filter((category) => category.parentId),
    [filteredCategories]
  );
  const activeTypeLabel = activeTab === 'EXPENSE' ? 'despesas' : 'receitas';

  function getChildrenForParent(parentId: number) {
    return childCategories.filter((category) => category.parentId === parentId);
  }

  return (
    <DashboardLayout>
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          { label: 'Financeiro' },
          { label: 'Categorias' }
        ]}
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-white">Categorias Financeiras</h1>
          <InfoModalButton
            modalTitle="Informações sobre categorias"
            buttonLabel="Ver informações sobre categorias financeiras"
          >
            <p>
              Defina uma categoria padrão para {activeTypeLabel} para que ela seja
              selecionada automaticamente em novos lançamentos.
            </p>
            <p>
              Use categorias principais e subcategorias para organizar a listagem e
              facilitar o preenchimento das movimentações.
            </p>
          </InfoModalButton>
        </div>
        <Link
          href={{
            pathname: '/financial/categories/new',
            query: { type: activeTab }
          }}
        >
          <Button variant="accent" className="flex items-center gap-2">
            <Plus size={16} />
            Nova Categoria
          </Button>
        </Link>
      </div>

      <Card className="mb-6">
        <div className="flex space-x-1">
          <button
            onClick={() => changeActiveTab('EXPENSE')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'EXPENSE'
                ? 'bg-red-600 text-white'
                : 'bg-[#1e2126] text-gray-400 hover:text-white'
            }`}
          >
            <TrendingDown size={16} />
            Despesas
          </button>
          <button
            onClick={() => changeActiveTab('INCOME')}
            className={`flex items-center gap-2 rounded px-3 py-1.5 font-medium transition-colors ${
              activeTab === 'INCOME'
                ? 'bg-green-600 text-white'
                : 'bg-[#1e2126] text-gray-400 hover:text-white'
            }`}
          >
            <TrendingUp size={16} />
            Receitas
          </button>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded bg-[#1e2126]" />
            ))}
          </div>
        ) : error ? (
          <div className="py-10 text-center">
            <div className="mb-4 text-red-400">{error}</div>
            <Button variant="outline" onClick={() => void fetchCategories()}>
              Tentar Novamente
            </Button>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-10 text-center">
            <Tag size={48} className="mx-auto mb-4 text-gray-400" />
            <p className="mb-4 text-gray-400">
              Nenhuma categoria de {activeTab === 'EXPENSE' ? 'despesa' : 'receita'} cadastrada
            </p>
            <Link
              href={{
                pathname: '/financial/categories/new',
                query: { type: activeTab }
              }}
            >
              <Button variant="accent" className="inline-flex items-center gap-2">
                <Plus size={16} />
                Criar Primeira Categoria
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#0f1419] text-xs uppercase text-gray-400">
                <tr>
                  <th className="w-24 px-4 py-3 text-center">Ações</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Categoria Pai</th>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-center">Padrão</th>
                </tr>
              </thead>
              <tbody>
                {parentCategories.map((category) => (
                  <React.Fragment key={category.id}>
                    <tr
                      className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${
                        category.isDefault ? 'bg-yellow-900/10' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => void handleSetDefault(category)}
                            className={`p-1 transition-colors ${
                              category.isDefault
                                ? 'text-yellow-400 hover:text-yellow-300'
                                : 'text-gray-300 hover:text-yellow-400'
                            }`}
                            title={category.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                            disabled={confirmation.loading}
                          >
                            {category.isDefault ? (
                              <Star size={16} className="fill-current" />
                            ) : (
                              <StarOff size={16} />
                            )}
                          </button>
                          <Link
                            href={`/financial/categories/${category.id}`}
                            className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => void handleDelete(category)}
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
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0f1419]">
                            <CategoryIcon icon={category.icon} size={16} color={category.color} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 font-medium text-white">
                              {category.name}
                              {category.isDefault && (
                                <Star size={12} className="fill-current text-yellow-400" />
                              )}
                            </div>
                            <div className="text-sm text-gray-400">
                              Categoria principal • {getChildrenForParent(category.id).length} subcategorias
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-gray-300">-</td>
                      <td className="px-4 py-3 text-gray-300">{category.accountingCode || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {category.isDefault && (
                          <span className="rounded-full bg-yellow-700 px-2 py-1 text-xs text-yellow-300">
                            Padrão
                          </span>
                        )}
                      </td>
                    </tr>

                    {getChildrenForParent(category.id).map((child) => (
                      <tr
                        key={child.id}
                        className={`border-b border-gray-700 bg-[#0f1419] hover:bg-[#1a1f2b] ${
                          child.isDefault ? 'bg-yellow-900/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => void handleSetDefault(child)}
                              className={`p-1 transition-colors ${
                                child.isDefault
                                  ? 'text-yellow-400 hover:text-yellow-300'
                                  : 'text-gray-300 hover:text-yellow-400'
                              }`}
                              title={child.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                              disabled={confirmation.loading}
                            >
                              {child.isDefault ? (
                                <Star size={14} className="fill-current" />
                              ) : (
                                <StarOff size={14} />
                              )}
                            </button>
                            <Link
                              href={`/financial/categories/${child.id}`}
                              className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                              title="Editar"
                            >
                              <Edit2 size={14} />
                            </Link>
                            <button
                              onClick={() => void handleDelete(child)}
                              className="p-1 text-gray-300 transition-colors hover:text-red-400"
                              title="Excluir"
                              disabled={confirmation.loading}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="ml-6 flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#0f1419]">
                              <CategoryIcon icon={child.icon} size={14} color={child.color} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 text-white">
                                {child.name}
                                {child.isDefault && (
                                  <Star size={12} className="fill-current text-yellow-400" />
                                )}
                              </div>
                              <div className="text-xs text-gray-500">Subcategoria</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3 text-gray-300">{category.name}</td>
                        <td className="px-4 py-3 text-gray-300">{child.accountingCode || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          {child.isDefault && (
                            <span className="rounded-full bg-yellow-700 px-2 py-1 text-xs text-yellow-300">
                              Padrão
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}

                {childCategories
                  .filter((child) => !parentCategories.find((parent) => parent.id === child.parentId))
                  .map((orphan) => (
                    <tr
                      key={orphan.id}
                      className="border-b border-yellow-600/30 bg-yellow-900/20 hover:bg-[#1a1f2b]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => void handleSetDefault(orphan)}
                            className={`p-1 transition-colors ${
                              orphan.isDefault
                                ? 'text-yellow-400 hover:text-yellow-300'
                                : 'text-gray-300 hover:text-yellow-400'
                            }`}
                            title={orphan.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                            disabled={confirmation.loading}
                          >
                            {orphan.isDefault ? (
                              <Star size={16} className="fill-current" />
                            ) : (
                              <StarOff size={16} />
                            )}
                          </button>
                          <Link
                            href={`/financial/categories/${orphan.id}`}
                            className="p-1 text-gray-300 transition-colors hover:text-[#2563eb]"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => void handleDelete(orphan)}
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
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[#0f1419]">
                            <CategoryIcon icon={orphan.icon} size={16} color={orphan.color} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 text-white">
                              {orphan.name}
                              <span className="rounded bg-yellow-700 px-2 py-1 text-xs text-yellow-300">
                                Órfã
                              </span>
                              {orphan.isDefault && (
                                <Star size={12} className="fill-current text-yellow-400" />
                              )}
                            </div>
                            <div className="text-sm text-yellow-400">Categoria pai foi excluída</div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-yellow-400">Categoria pai excluída</td>
                      <td className="px-4 py-3 text-gray-300">{orphan.accountingCode || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {orphan.isDefault && (
                          <span className="rounded-full bg-yellow-700 px-2 py-1 text-xs text-yellow-300">
                            Padrão
                          </span>
                        )}
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
    </DashboardLayout>
  );
}

export default function CategoriesPage() {
  return (
    <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_CATEGORIES">
      <CategoriesPageInner />
    </PageGuard>
  );
}
