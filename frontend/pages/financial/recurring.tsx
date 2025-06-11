// frontend/pages/financial/recurring.tsx
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { PageLoader } from '../../components/ui/PageLoader';
import { useToast } from '../../components/ui/ToastContext';
import { Plus, Edit2, Trash2, Calendar, DollarSign, Play, Pause, MoreVertical, TrendingUp, TrendingDown, Save, X } from 'lucide-react';
import api from '../../lib/api';

interface RecurringTransaction {
  id: number;
  description: string;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  frequency: string;
  dayOfMonth?: number;
  dayOfWeek?: number;
  nextDueDate: string;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  notes?: string;
  fromAccount?: { id: number; name: string };
  toAccount?: { id: number; name: string };
  category?: { id: number; name: string; color: string };
  _count: { transactions: number };
}

interface Account {
  id: number;
  name: string;
  type: string;
}

interface Category {
  id: number;
  name: string;
  color: string;
  type: string;
}

export default function FinancialRecurringPage() {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'EXPENSE' as 'EXPENSE' | 'INCOME',
    frequency: 'MONTHLY',
    dayOfMonth: '5',
    dayOfWeek: '1',
    fromAccountId: '',
    toAccountId: '',  
    categoryId: '',
    notes: '',
    endDate: ''
  });

  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  // Fechar dropdown quando clicar fora
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [recurringRes, accountsRes, categoriesRes] = await Promise.all([
        api.get('/financial/recurring'),
        api.get('/financial/accounts'),
        api.get('/financial/categories')
      ]);
      
      setRecurring(recurringRes.data);
      setAccounts(accountsRes.data);
      setCategories(categoriesRes.data);
    } catch (error) {
      addToast('Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);
    
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount.replace(/[^\d.-]/g, '')),
        dayOfMonth: formData.frequency === 'MONTHLY' ? parseInt(formData.dayOfMonth) : undefined,
        dayOfWeek: formData.frequency === 'WEEKLY' ? parseInt(formData.dayOfWeek) : undefined,
        startDate: new Date().toISOString(),
        endDate: formData.endDate ? new Date(formData.endDate).toISOString() : undefined,
        fromAccountId: formData.type === 'EXPENSE' && formData.fromAccountId ? parseInt(formData.fromAccountId) : null,
        toAccountId: formData.type === 'INCOME' && formData.toAccountId ? parseInt(formData.toAccountId) : null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null
      };

      if (editingId) {
        await api.put(`/financial/recurring/${editingId}`, payload);
        addToast('Transação recorrente atualizada', 'success');
      } else {
        await api.post('/financial/recurring', payload);
        addToast('Transação recorrente criada', 'success');
      }
      
      resetForm();
      fetchData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Tem certeza que deseja excluir esta transação recorrente?')) return;
    
    try {
      await api.delete(`/financial/recurring/${id}`);
      addToast('Transação recorrente excluída', 'success');
      fetchData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao excluir', 'error');
    }
  }

  async function handleToggleActive(id: number, isActive: boolean) {
    try {
      await api.put(`/financial/recurring/${id}`, { isActive: !isActive });
      addToast(`Transação recorrente ${!isActive ? 'ativada' : 'desativada'}`, 'success');
      fetchData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao alterar status', 'error');
    }
  }

  async function handleGenerate(id: number) {
    try {
      const res = await api.post(`/financial/recurring/${id}/generate`);
      addToast(`${res.data.generated} transações agendadas criadas`, 'success');
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao gerar transações', 'error');
    }
  }

  function resetForm() {
    setFormData({
      description: '',
      amount: '',
      type: activeTab,
      frequency: 'MONTHLY',
      dayOfMonth: '5',
      dayOfWeek: '1',
      fromAccountId: '',
      toAccountId: '',
      categoryId: '',
      notes: '',
      endDate: ''
    });
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(item: RecurringTransaction) {
    setFormData({
      description: item.description,
      amount: item.amount,
      type: item.type,
      frequency: item.frequency,
      dayOfMonth: item.dayOfMonth?.toString() || '5',
      dayOfWeek: item.dayOfWeek?.toString() || '1',
      fromAccountId: item.fromAccount?.id.toString() || '',
      toAccountId: item.toAccount?.id.toString() || '',
      categoryId: item.category?.id.toString() || '',
      notes: item.notes || '',
      endDate: item.endDate ? new Date(item.endDate).toISOString().split('T')[0] : ''
    });
    setEditingId(item.id);
    setShowForm(true);
    setActiveDropdown(null);
  }

  function formatCurrency(value: string | number): string {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(num);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('pt-BR');
  }

  const frequencyLabels: Record<string, string> = {
    DAILY: 'Diário',
    WEEKLY: 'Semanal', 
    MONTHLY: 'Mensal',
    QUARTERLY: 'Trimestral',
    YEARLY: 'Anual'
  };

  const dayOfWeekLabels: Record<string, string> = {
    '0': 'Domingo', '1': 'Segunda', '2': 'Terça', '3': 'Quarta',
    '4': 'Quinta', '5': 'Sexta', '6': 'Sábado'
  };

  // Filtrar por tipo ativo
  const filteredRecurring = recurring.filter(item => item.type === activeTab);

  if (loading) {
    return (
      <DashboardLayout title="Transações Recorrentes">
        <PageLoader message="Carregando transações recorrentes..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Transações Recorrentes">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro' },
        { label: 'Recorrentes' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Transações Recorrentes</h1>
        <Button 
          variant="accent" 
          onClick={() => {
            setFormData({...formData, type: activeTab});
            setShowForm(true);
          }}
          className="flex items-center gap-2"
        >
          <Plus size={16} />
          Nova Transação Recorrente
        </Button>
      </div>

      {/* Abas */}
      <div className="flex space-x-1 mb-6">
        <button
          onClick={() => setActiveTab('EXPENSE')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            activeTab === 'EXPENSE'
              ? 'bg-red-600 text-white'
              : 'bg-[#1e2126] text-gray-400 hover:text-white'
          }`}
        >
          <TrendingDown size={16} className="inline mr-2" />
          Despesas Fixas
        </button>
        <button
          onClick={() => setActiveTab('INCOME')}
          className={`px-3 py-1.5 rounded font-medium transition-colors ${
            activeTab === 'INCOME'
              ? 'bg-green-600 text-white'
              : 'bg-[#1e2126] text-gray-400 hover:text-white'
          }`}
        >
          <TrendingUp size={16} className="inline mr-2" />
          Receitas Fixas
        </button>
      </div>

      {/* Lista de Transações Recorrentes */}
      <Card>
        {filteredRecurring.length === 0 ? (
          <div className="text-center py-10">
            <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">
              Nenhuma {activeTab === 'EXPENSE' ? 'despesa fixa' : 'receita fixa'} cadastrada
            </p>
            <Button 
              variant="accent" 
              onClick={() => {
                setFormData({...formData, type: activeTab});
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Criar Primeira {activeTab === 'EXPENSE' ? 'Despesa' : 'Receita'} Fixa
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredRecurring.map((item) => (
              <div key={item.id} className="border border-gray-700 rounded-lg p-4 hover:bg-[#1a1f2b] transition-colors">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <DollarSign size={16} className={item.type === 'EXPENSE' ? 'text-red-400' : 'text-green-400'} />
                        <h3 className="font-medium text-white">{item.description}</h3>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.isActive 
                          ? 'bg-green-900 text-green-300' 
                          : 'bg-gray-700 text-gray-400'
                      }`}>
                        {item.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Valor:</span>
                        <p className={`font-medium ${item.type === 'EXPENSE' ? 'text-red-400' : 'text-green-400'}`}>
                          {formatCurrency(item.amount)}
                        </p>
                      </div>
                      
                      <div>
                        <span className="text-gray-400">Frequência:</span>
                        <p className="text-white">
                          {frequencyLabels[item.frequency]}
                          {item.frequency === 'MONTHLY' && item.dayOfMonth && ` (dia ${item.dayOfMonth})`}
                          {item.frequency === 'WEEKLY' && item.dayOfWeek !== undefined && ` (${dayOfWeekLabels[item.dayOfWeek.toString()]})`}
                        </p>
                      </div>
                      
                      <div>
                        <span className="text-gray-400">Próximo vencimento:</span>
                        <p className="text-white">{formatDate(item.nextDueDate)}</p>
                      </div>
                      
                      <div>
                        <span className="text-gray-400">Transações geradas:</span>
                        <p className="text-white">{item._count.transactions}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-sm">
                      {item.fromAccount && (
                        <div>
                          <span className="text-gray-400">Conta de origem:</span>
                          <p className="text-white">{item.fromAccount.name}</p>
                        </div>
                      )}
                      
                      {item.toAccount && (
                        <div>
                          <span className="text-gray-400">Conta de destino:</span>
                          <p className="text-white">{item.toAccount.name}</p>
                        </div>
                      )}
                      
                      {item.category && (
                        <div>
                          <span className="text-gray-400">Categoria:</span>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: item.category.color }}
                            />
                            <p className="text-white">{item.category.name}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {item.endDate && (
                      <div className="mt-2 text-sm">
                        <span className="text-gray-400">Termina em:</span>
                        <p className="text-white">{formatDate(item.endDate)}</p>
                      </div>
                    )}

                    {item.notes && (
                      <div className="mt-2 text-sm">
                        <span className="text-gray-400">Observações:</span>
                        <p className="text-gray-300">{item.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Menu de Ações */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(activeDropdown === item.id ? null : item.id);
                      }}
                      className="p-2 text-gray-400 hover:text-white hover:bg-[#262b36] rounded-lg"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {activeDropdown === item.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-[#1e2126] border border-gray-700 rounded-lg shadow-lg z-10">
                        <button
                          onClick={() => startEdit(item)}
                          className="w-full px-4 py-2 text-left text-white hover:bg-[#262b36] flex items-center gap-2"
                        >
                          <Edit2 size={14} />
                          Editar
                        </button>
                        
                        <button
                          onClick={() => handleToggleActive(item.id, item.isActive)}
                          className="w-full px-4 py-2 text-left text-white hover:bg-[#262b36] flex items-center gap-2"
                        >
                          {item.isActive ? <Pause size={14} /> : <Play size={14} />}
                          {item.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                        
                        <button
                          onClick={() => {
                            handleGenerate(item.id);
                            setActiveDropdown(null);
                          }}
                          className="w-full px-4 py-2 text-left text-white hover:bg-[#262b36] flex items-center gap-2"
                        >
                          <Calendar size={14} />
                          Gerar Transações
                        </button>
                        
                        <hr className="border-gray-700 my-1" />
                        
                        <button
                          onClick={() => {
                            handleDelete(item.id);
                            setActiveDropdown(null);
                          }}
                          className="w-full px-4 py-2 text-left text-red-400 hover:bg-[#262b36] flex items-center gap-2"
                        >
                          <Trash2 size={14} />
                          Excluir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151921] rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-700">
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <h3 className="text-xl font-semibold text-white">
                {editingId ? 'Editar' : 'Nova'} {formData.type === 'EXPENSE' ? 'Despesa' : 'Receita'} Recorrente
              </h3>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetForm}
                  disabled={formLoading}
                  className="flex items-center gap-2"
                >
                  <X size={16} />
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="recurring-form"
                  variant="accent"
                  disabled={formLoading}
                  className="flex items-center gap-2"
                >
                  <Save size={16} />
                  {formLoading ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </div>

            <form id="recurring-form" onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Descrição"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  required
                  placeholder="Ex: Aluguel, Salário, Internet..."
                />
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Tipo
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as 'EXPENSE' | 'INCOME'})}
                    className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                    required
                  >
                    <option value="EXPENSE">Despesa</option>
                    <option value="INCOME">Receita</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Valor"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  required
                  placeholder="0,00"
                />
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Frequência
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({...formData, frequency: e.target.value})}
                    className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                    required
                  >
                    <option value="DAILY">Diário</option>
                    <option value="WEEKLY">Semanal</option>
                    <option value="MONTHLY">Mensal</option>
                    <option value="QUARTERLY">Trimestral</option>
                    <option value="YEARLY">Anual</option>
                  </select>
                </div>
              </div>

              {/* Configurações específicas da frequência */}
              {formData.frequency === 'MONTHLY' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Dia do mês
                  </label>
                  <select
                    value={formData.dayOfMonth}
                    onChange={(e) => setFormData({...formData, dayOfMonth: e.target.value})}
                    className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                  >
                    {Array.from({length: 31}, (_, i) => i + 1).map(day => (
                      <option key={day} value={day}>Dia {day}</option>
                    ))}
                  </select>
                </div>
              )}

              {formData.frequency === 'WEEKLY' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Dia da semana
                  </label>
                  <select
                    value={formData.dayOfWeek}
                    onChange={(e) => setFormData({...formData, dayOfWeek: e.target.value})}
                    className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                  >
                    {Object.entries(dayOfWeekLabels).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {formData.type === 'EXPENSE' && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-300">
                      Conta de origem *
                    </label>
                    <select
                      value={formData.fromAccountId}
                      onChange={(e) => setFormData({...formData, fromAccountId: e.target.value})}
                      className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                      required
                    >
                      <option value="">Selecione uma conta</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {formData.type === 'INCOME' && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-300">
                      Conta de destino *
                    </label>
                    <select
                      value={formData.toAccountId}
                      onChange={(e) => setFormData({...formData, toAccountId: e.target.value})}
                      className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                      required
                    >
                      <option value="">Selecione uma conta</option>
                      {accounts.map(account => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-300">
                    Categoria
                  </label>
                  <select
                    value={formData.categoryId}
                    onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
                    className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                  >
                    <option value="">Sem categoria</option>
                    {categories
                      .filter(category => category.type === formData.type)
                      .map(category => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <Input
                label="Data de término (opcional)"
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                className="mb-0"
              />
              
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300">
                  Observações
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-2 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-blue-500"
                  placeholder="Observações adicionais..."
                ></textarea>
              </div>
              
              <div className="flex justify-end gap-4 mt-6 pt-6 border-t border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={resetForm}
                className="flex-1 flex items-center gap-2"
              >
                <X size={16} />
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="accent"
                disabled={formLoading}
                className="flex-1 flex items-center gap-2"
              >
                <Save size={16} />
                {formLoading
                  ? 'Salvando...'
                  : editingId
                    ? 'Atualizar'
                    : 'Criar'
                }
              </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}