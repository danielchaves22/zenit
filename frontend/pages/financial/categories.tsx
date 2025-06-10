// frontend/pages/financial/categories.tsx - PADRONIZADA
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastContext';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { useConfirmation } from '@/hooks/useConfirmation';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Plus, Tag, Edit2, Trash2, TrendingUp, TrendingDown, Star, StarOff } from 'lucide-react';
import api from '@/lib/api';

interface Category {
  id: number;
  name: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  color: string;
  isDefault: boolean;
  parentId?: number;
  parent?: { id: number; name: string };
  accountingCode?: string;
  createdAt: string;
  updatedAt: string;
  _count?: { children: number };
}

function CategoriesPageInner() {
  const confirmation = useConfirmation();
  const { addToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'EXPENSE' as 'INCOME' | 'EXPENSE' | 'TRANSFER',
    color: '#6366F1',
    parentId: '',
    accountingCode: ''
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao carregar categorias';
      setError(errorMsg);
      addToast(errorMsg, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDefault(category: Category) {
    if (category.isDefault) {
      // Se já é padrão, remover
      confirmation.confirm(
        {
          title: 'Remover Categoria Padrão',
          message: `Tem certeza que deseja remover "${category.name}" como categoria padrão para ${category.type === 'EXPENSE' ? 'despesas' : 'receitas'}?`,
          confirmText: 'Remover Padrão',
          cancelText: 'Cancelar',
          type: 'warning'
        },
        async () => {
          try {
            await api.delete(`/financial/categories/${category.id}/set-default`);
            addToast('Categoria padrão removida com sucesso', 'success');
            fetchCategories();
          } catch (error: any) {
            addToast(error.response?.data?.error || 'Erro ao remover categoria padrão', 'error');
            throw error;
          }
        }
      );
    } else {
      // Se não é padrão, definir como padrão
      const currentDefault = categories.find(cat => cat.isDefault && cat.type === category.type);
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
            fetchCategories();
          } catch (error: any) {
            addToast(error.response?.data?.error || 'Erro ao definir categoria padrão', 'error');
            throw error;
          }
        }
      );
    }
  }

  function openNewForm() {
    setEditingCategory(null);
    setFormData({
      name: '',
      type: activeTab,
      color: '#6366F1',
      parentId: '',
      accountingCode: ''
    });
    setShowForm(true);
  }

  function openEditForm(category: Category) {
    setEditingCategory(category);
    setFormData({
        name: category.name,
        type: category.type as 'INCOME' | 'EXPENSE' | 'TRANSFER',
        color: category.color,
        parentId: category.parentId?.toString() || '',
        accountingCode: category.accountingCode || ''
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCategory(null);
    setFormData({
      name: '',
      type: 'EXPENSE',
      color: '#6366F1',
      parentId: '',
      accountingCode: ''
    });
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da categoria é obrigatório', 'error');
      return;
    }

    setFormLoading(true);

    try {
      const payload = {
        ...formData,
        parentId: formData.parentId ? parseInt(formData.parentId) : null
      };

      if (editingCategory) {
        await api.put(`/financial/categories/${editingCategory.id}`, payload);
        addToast('Categoria atualizada com sucesso', 'success');
      } else {
        await api.post('/financial/categories', payload);
        addToast('Categoria criada com sucesso', 'success');
      }

      closeForm();
      fetchCategories();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar categoria', 'error');
    } finally {
      setFormLoading(false);
    }
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
          
          if (editingCategory?.id === category.id) {
            closeForm();
          }
          
          fetchCategories();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir categoria', 'error');
          throw err;
        }
      }
    );
  }

  // Filtrar categorias por tipo ativo
  const filteredCategories = categories.filter(cat => cat.type === activeTab);

  // Separar categorias pai e filhas
  const parentCategories = filteredCategories.filter(cat => !cat.parentId);
  const childCategories = filteredCategories.filter(cat => cat.parentId);

  const getChildrenForParent = (parentId: number) => {
    return childCategories.filter(cat => cat.parentId === parentId);
  };

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Financeiro' },
        { label: 'Categorias' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Categorias Financeiras</h1>
        <Button 
          variant="accent" 
          onClick={() => showForm ? closeForm() : openNewForm()}
          className="flex items-center gap-2"
          disabled={formLoading}
        >
          <Plus size={16} />
          {showForm ? 'Cancelar' : 'Nova Categoria'}
        </Button>
      </div>

      {/* Abas de Tipo */}
      {!showForm && (
        <Card className="mb-6">
          <div className="flex space-x-1">
          <button
            onClick={() => setActiveTab('EXPENSE')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'EXPENSE'
                ? 'bg-red-600 text-white'
                : 'bg-[#1e2126] text-gray-400 hover:text-white'
            }`}
          >
            <TrendingDown size={16} />
            Despesas
          </button>
          <button
            onClick={() => setActiveTab('INCOME')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
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
      )}

      {/* Info sobre categoria padrão */}
      {!showForm && (
        <Card className="mb-6 bg-blue-900/20 border-blue-600">
          <div className="flex items-start gap-3">
            <Star size={20} className="text-blue-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-300 mb-1">Categoria Padrão</h3>
              <p className="text-sm text-blue-200">
                Defina uma categoria padrão para {activeTab === 'EXPENSE' ? 'despesas' : 'receitas'} 
                que será automaticamente selecionada em novos lançamentos.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Formulário Inline */}
      {showForm && (
        <Card className="mb-6 border-2 border-[#2563eb]">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">
              {editingCategory ? `Editando: ${editingCategory.name}` : `Nova Categoria de ${activeTab === 'EXPENSE' ? 'Despesa' : 'Receita'}`}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nome da Categoria"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                placeholder="Ex: Alimentação, Vendas, Marketing..."
                disabled={formLoading}
              />
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Tipo
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({...formData, type: e.target.value as 'INCOME' | 'EXPENSE'})}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  disabled={formLoading}
                >
                  <option value="EXPENSE">Despesa</option>
                  <option value="INCOME">Receita</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Cor
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({...formData, color: e.target.value})}
                    className="w-12 h-10 border border-gray-700 rounded cursor-pointer"
                    disabled={formLoading}
                  />
                  <Input
                    value={formData.color}
                    onChange={(e) => setFormData({...formData, color: e.target.value})}
                    placeholder="#6366F1"
                    className="flex-1 mb-0"
                    disabled={formLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Categoria Pai (opcional)
                </label>
                <select
                  value={formData.parentId}
                  onChange={(e) => setFormData({...formData, parentId: e.target.value})}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  disabled={formLoading}
                >
                  <option value="">Nenhuma (categoria principal)</option>
                  {categories
                    .filter(cat => 
                      cat.type === formData.type && 
                      !cat.parentId && 
                      cat.id !== editingCategory?.id
                    )
                    .map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                </select>
              </div>

              <Input
                label="Código Contábil (opcional)"
                value={formData.accountingCode}
                onChange={(e) => setFormData({...formData, accountingCode: e.target.value})}
                placeholder="Ex: 1.1.001"
                className="mb-0"
                disabled={formLoading}
              />
            </div>

            <div className="flex gap-3">
              <Button 
                variant="accent" 
                onClick={handleSubmit}
                disabled={formLoading}
              >
                {formLoading 
                  ? 'Salvando...' 
                  : editingCategory 
                    ? 'Salvar Alterações' 
                    : 'Criar Categoria'
                }
              </Button>
              <Button 
                variant="outline" 
                onClick={closeForm}
                disabled={formLoading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Lista de Categorias */}
      <Card>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded bg-[#1e2126]" />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10">
            <div className="text-red-400 mb-4">{error}</div>
            <Button variant="outline" onClick={fetchCategories}>
              Tentar Novamente
            </Button>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="text-center py-10">
            <Tag size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">
              Nenhuma categoria de {activeTab === 'EXPENSE' ? 'despesa' : 'receita'} cadastrada
            </p>
            <Button 
              variant="accent" 
              onClick={openNewForm}
              className="inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Criar Primeira Categoria
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-center w-24">Ações</th>
                  <th className="px-4 py-3 text-left">Categoria</th>
                  <th className="px-4 py-3 text-left">Categoria Pai</th>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-center">Padrão</th>
                </tr>
              </thead>
              <tbody>
                {/* Categorias Principais */}
                {parentCategories.map((category) => (
                  <React.Fragment key={category.id}>
                    <tr 
                      className={`border-b border-gray-700 hover:bg-[#1a1f2b] ${
                        editingCategory?.id === category.id 
                          ? 'bg-[#2563eb]/10 border-[#2563eb]/30' 
                          : ''
                      } ${category.isDefault ? 'bg-yellow-900/10' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => handleSetDefault(category)}
                            className={`p-1 transition-colors ${
                              category.isDefault 
                                ? 'text-yellow-400 hover:text-yellow-300' 
                                : 'text-gray-300 hover:text-yellow-400'
                            }`}
                            title={category.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                            disabled={formLoading}
                          >
                            {category.isDefault ? (
                              <Star size={16} className="fill-current" />
                            ) : (
                              <StarOff size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => openEditForm(category)}
                            className="p-1 text-gray-300 hover:text-[#2563eb] transition-colors"
                            title="Editar"
                            disabled={formLoading}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(category)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                            title="Excluir"
                            disabled={formLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-full border-2 border-white"
                            style={{ backgroundColor: category.color }}
                          />
                          <div>
                            <div className="font-medium text-white flex items-center gap-2">
                              {category.name}
                              {category.isDefault && (
                                <Star size={12} className="text-yellow-400 fill-current" />
                              )}
                            </div>
                            <div className="text-sm text-gray-400">
                              Categoria principal • {getChildrenForParent(category.id).length} subcategorias
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 text-gray-300">
                        -
                      </td>
                      
                      <td className="px-4 py-3 text-gray-300">
                        {category.accountingCode || '-'}
                      </td>
                      
                      <td className="px-4 py-3 text-center">
                        {category.isDefault && (
                          <span className="px-2 py-1 bg-yellow-700 text-yellow-300 text-xs rounded-full">
                            Padrão
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Subcategorias */}
                    {getChildrenForParent(category.id).map((child) => (
                      <tr 
                        key={child.id}
                        className={`border-b border-gray-700 hover:bg-[#1a1f2b] bg-[#0f1419] ${
                          editingCategory?.id === child.id 
                            ? 'bg-[#2563eb]/10 border-[#2563eb]/30' 
                            : ''
                        } ${child.isDefault ? 'bg-yellow-900/10' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-center">
                            <button
                              onClick={() => handleSetDefault(child)}
                              className={`p-1 transition-colors ${
                                child.isDefault 
                                  ? 'text-yellow-400 hover:text-yellow-300' 
                                  : 'text-gray-300 hover:text-yellow-400'
                              }`}
                              title={child.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                              disabled={formLoading}
                            >
                              {child.isDefault ? (
                                <Star size={14} className="fill-current" />
                              ) : (
                                <StarOff size={14} />
                              )}
                            </button>
                            <button
                              onClick={() => openEditForm(child)}
                              className="p-1 text-gray-300 hover:text-[#2563eb] transition-colors"
                              title="Editar"
                              disabled={formLoading}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(child)}
                              className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                              title="Excluir"
                              disabled={formLoading}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                        
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3 ml-6">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: child.color }}
                            />
                            <div>
                              <div className="text-white flex items-center gap-2">
                                {child.name}
                                {child.isDefault && (
                                  <Star size={12} className="text-yellow-400 fill-current" />
                                )}
                              </div>
                              <div className="text-xs text-gray-500">
                                Subcategoria
                              </div>
                            </div>
                          </div>
                        </td>
                        
                        <td className="px-4 py-3 text-gray-300">
                          {category.name}
                        </td>
                        
                        <td className="px-4 py-3 text-gray-300">
                          {child.accountingCode || '-'}
                        </td>
                        
                        <td className="px-4 py-3 text-center">
                          {child.isDefault && (
                            <span className="px-2 py-1 bg-yellow-700 text-yellow-300 text-xs rounded-full">
                              Padrão
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}

                {/* Categorias órfãs */}
                {childCategories
                  .filter(child => !parentCategories.find(parent => parent.id === child.parentId))
                  .map((orphan) => (
                    <tr 
                      key={orphan.id}
                      className={`border-b border-gray-700 hover:bg-[#1a1f2b] bg-yellow-900/20 border-yellow-600/30 ${
                        editingCategory?.id === orphan.id 
                          ? 'bg-[#2563eb]/10 border-[#2563eb]/30' 
                          : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-center">
                          <button
                            onClick={() => handleSetDefault(orphan)}
                            className={`p-1 transition-colors ${
                              orphan.isDefault 
                                ? 'text-yellow-400 hover:text-yellow-300' 
                                : 'text-gray-300 hover:text-yellow-400'
                            }`}
                            title={orphan.isDefault ? 'Remover como padrão' : 'Definir como padrão'}
                            disabled={formLoading}
                          >
                            {orphan.isDefault ? (
                              <Star size={16} className="fill-current" />
                            ) : (
                              <StarOff size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => openEditForm(orphan)}
                            className="p-1 text-gray-300 hover:text-[#2563eb] transition-colors"
                            title="Editar"
                            disabled={formLoading}
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(orphan)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors"
                            title="Excluir"
                            disabled={formLoading}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: orphan.color }}
                          />
                          <div>
                            <div className="text-white flex items-center gap-2">
                              {orphan.name}
                              <span className="text-xs bg-yellow-700 text-yellow-300 px-2 py-1 rounded">
                                Órfã
                              </span>
                              {orphan.isDefault && (
                                <Star size={12} className="text-yellow-400 fill-current" />
                              )}
                            </div>
                            <div className="text-sm text-yellow-400">
                              Categoria pai foi excluída
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3 text-yellow-400">
                        Categoria pai excluída
                      </td>
                      
                      <td className="px-4 py-3 text-gray-300">
                        {orphan.accountingCode || '-'}
                      </td>
                      
                      <td className="px-4 py-3 text-center">
                        {orphan.isDefault && (
                          <span className="px-2 py-1 bg-yellow-700 text-yellow-300 text-xs rounded-full">
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