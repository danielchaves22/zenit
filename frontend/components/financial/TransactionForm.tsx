// frontend/components/financial/TransactionForm.tsx - COM AUTOCOMPLETE
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { AutocompleteInput } from '@/components/ui/AutocompleteInput'; // ✅ NOVO IMPORT
import { useToast } from '@/components/ui/ToastContext';
import { useConfirmation } from '@/hooks/useConfirmation';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { ArrowLeft, Save, X, Trash2, Star, Sparkles } from 'lucide-react';
import api from '@/lib/api';

interface Account {
  id: number;
  name: string;
  type: string;
  isDefault: boolean;
  isActive: boolean;
}

interface Category {
  id: number;
  name: string;
  type: string;
  color: string;
  isDefault: boolean;
}

interface Transaction {
  id: number;
  description: string;
  amount: string;
  date: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  status: 'PENDING' | 'COMPLETED' | 'CANCELED';
  notes?: string;
  fromAccount?: { id: number; name: string };
  toAccount?: { id: number; name: string };
  category?: { id: number; name: string; color: string };
  tags: { id: number; name: string }[];
}

// ✅ INTERFACE PARA SUGESTÕES DE AUTOCOMPLETE
interface AutocompleteSuggestion {
  description: string;
  frequency: number;
}

interface TransactionFormProps {
  mode: 'create' | 'edit';
  transactionId?: string;
  initialType?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  isTypeLocked?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function TransactionForm({ 
  mode, 
  transactionId, 
  initialType = 'EXPENSE',
  isTypeLocked = false,
  onSuccess,
  onCancel 
}: TransactionFormProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const confirmation = useConfirmation();
  
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [shouldFocusAmount, setShouldFocusAmount] = useState(mode === 'create');
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '0.00',
    date: new Date().toISOString().split('T')[0],
    type: initialType,
    status: 'COMPLETED',
    notes: '',
    fromAccountId: '',
    toAccountId: '',
    categoryId: '',
    tags: ''
  });

  useEffect(() => {
    fetchAccounts();
    fetchCategories();
    
    if (mode === 'edit' && transactionId) {
      fetchTransaction();
    }
  }, [mode, transactionId]);

  // Auto-foco no campo de valor para transações novas
  useEffect(() => {
    if (mode === 'create' && shouldFocusAmount && !loading) {
      const amountInput = document.getElementById('amount');
      if (amountInput) {
        setTimeout(() => {
          amountInput.focus();
          setShouldFocusAmount(false);
        }, 100);
      }
    }
  }, [mode, shouldFocusAmount, loading]);

  // Auto-selecionar valores padrão quando os dados estiverem carregados
  useEffect(() => {
    if (mode === 'create' && !defaultsLoaded && accounts.length > 0 && categories.length > 0) {
      autoSelectDefaults();
      setDefaultsLoaded(true);
    }
  }, [mode, accounts, categories, defaultsLoaded, formData.type]);

  // ✅ FUNÇÃO PARA BUSCAR SUGESTÕES DE AUTOCOMPLETE
  const fetchAutocompleteSuggestions = async (query: string): Promise<AutocompleteSuggestion[]> => {
    if (query.length < 3) {
      return [];
    }

    try {
      const response = await api.get('/financial/transactions/autocomplete', {
        params: { q: query }
      });
      return response.data.suggestions || [];
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error);
      return [];
    }
  };

  async function fetchTransaction() {
    if (!transactionId) return;
    
    try {
      const response = await api.get(`/financial/transactions/${transactionId}`);
      const txn = response.data;
      
      setTransaction(txn);
      setFormData({
        description: txn.description,
        amount: txn.amount,
        date: new Date(txn.date).toISOString().split('T')[0],
        type: txn.type,
        status: txn.status,
        notes: txn.notes || '',
        fromAccountId: txn.fromAccount?.id.toString() || '',
        toAccountId: txn.toAccount?.id.toString() || '',
        categoryId: txn.category?.id.toString() || '',
        tags: txn.tags.map((t: any) => t.name).join(', ')
      });
    } catch (error: any) {
      console.error('Erro ao carregar transação:', error);
      addToast('Erro ao carregar dados da transação', 'error');
      handleCancel();
    } finally {
      setLoading(false);
    }
  }

  async function fetchAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setAccounts(response.data);
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
      addToast('Erro ao carregar contas', 'error');
    }
  }

  async function fetchCategories() {
    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
      addToast('Erro ao carregar categorias', 'error');
    }
  }

  function autoSelectDefaults() {
    const updates: Partial<typeof formData> = {};

    // Auto-selecionar conta padrão
    if (!formData.fromAccountId && !formData.toAccountId) {
      const defaultAccount = accounts.find(acc => acc.isDefault && acc.isActive);
      if (defaultAccount) {
        if (formData.type === 'EXPENSE') {
          updates.fromAccountId = defaultAccount.id.toString();
        } else if (formData.type === 'INCOME') {
          updates.toAccountId = defaultAccount.id.toString();
        }
      } else {
        // Se não há conta padrão, usar a primeira conta ativa
        const firstActiveAccount = accounts.find(acc => acc.isActive);
        if (firstActiveAccount) {
          if (formData.type === 'EXPENSE') {
            updates.fromAccountId = firstActiveAccount.id.toString();
          } else if (formData.type === 'INCOME') {
            updates.toAccountId = firstActiveAccount.id.toString();
          }
        }
      }
    }

    // Auto-selecionar categoria padrão
    if (!formData.categoryId && formData.type !== 'TRANSFER') {
      const defaultCategory = categories.find(cat => 
        cat.isDefault && cat.type === formData.type
      );
      if (defaultCategory) {
        updates.categoryId = defaultCategory.id.toString();
      } else {
        // Se não há categoria padrão, usar a primeira categoria do tipo
        const firstCategoryOfType = categories.find(cat => cat.type === formData.type);
        if (firstCategoryOfType) {
          updates.categoryId = firstCategoryOfType.id.toString();
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      setFormData(prev => ({ ...prev, ...updates }));
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Tratamento especial para o tipo de transação
    if (name === 'type' && !isTypeLocked) {
      const newType = value;
      
      // Resetar contas de acordo com o tipo
      if (newType === 'EXPENSE') {
        setFormData(prev => ({ ...prev, type: newType, toAccountId: '' }));
      } else if (newType === 'INCOME') {
        setFormData(prev => ({ ...prev, type: newType, fromAccountId: '' }));
      } else {
        setFormData(prev => ({ ...prev, type: newType as 'INCOME' | 'EXPENSE' | 'TRANSFER' }));
      }
      
      // Auto-selecionar categoria padrão do novo tipo
      const defaultCategory = categories.find(cat => 
        cat.isDefault && cat.type === newType
      );
      if (defaultCategory) {
        setFormData(prev => ({ ...prev, categoryId: defaultCategory.id.toString() }));
      } else {
        // Se não há padrão, usar primeira categoria do tipo
        const firstCategoryOfType = categories.filter(c => c.type === newType);
        if (firstCategoryOfType.length > 0) {
          setFormData(prev => ({ ...prev, categoryId: firstCategoryOfType[0].id.toString() }));
        } else {
          setFormData(prev => ({ ...prev, categoryId: '' }));
        }
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // ✅ HANDLER PARA MUDANÇA NA DESCRIÇÃO (AUTOCOMPLETE)
  const handleDescriptionChange = (value: string) => {
    setFormData(prev => ({ ...prev, description: value }));
  };

  // ✅ HANDLER PARA SELEÇÃO DE SUGESTÃO
  const handleSuggestionSelect = (description: string) => {
    // Opcional: Adicionar lógica adicional quando uma sugestão é selecionada
    // Por exemplo, analisar a descrição e sugerir categoria baseada no histórico
    console.log('Sugestão selecionada:', description);
  };

  const handleAmountChange = (value: string) => {
    setFormData(prev => ({ ...prev, amount: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Preparar dados para envio
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        fromAccountId: formData.fromAccountId ? parseInt(formData.fromAccountId) : null,
        toAccountId: formData.toAccountId ? parseInt(formData.toAccountId) : null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      };
      
      if (mode === 'create') {
        await api.post('/financial/transactions', payload);
        addToast('Transação criada com sucesso', 'success');
      } else {
        await api.put(`/financial/transactions/${transactionId}`, payload);
        addToast('Transação atualizada com sucesso', 'success');
      }
      
      // Callback de sucesso ou redirecionamento padrão
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/financial/transactions');
      }
      
    } catch (error: any) {
      console.error('Erro ao salvar transação:', error);
      addToast(
        error.response?.data?.error || `Erro ao ${mode === 'create' ? 'criar' : 'atualizar'} transação`,
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!transaction) return;
    
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir a transação "${transaction.description}"? Esta ação não pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/financial/transactions/${transactionId}`);
          addToast('Transação excluída com sucesso', 'success');
          
          if (onSuccess) {
            onSuccess();
          } else {
            router.push('/financial/transactions');
          }
        } catch (error: any) {
          addToast(error.response?.data?.error || 'Erro ao excluir transação', 'error');
          throw error;
        }
      }
    );
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push('/financial/transactions');
    }
  };

  const getTypeLabel = () => {
    const baseLabel = mode === 'create' ? 'Nova' : 'Editar';
    switch (formData.type) {
      case 'INCOME':
        return `${baseLabel} Receita`;
      case 'EXPENSE':
        return `${baseLabel} Despesa`;
      case 'TRANSFER':
        return `${baseLabel} Transferência`;
      default:
        return `${baseLabel} Transação`;
    }
  };

  // Encontrar categorias e contas padrão para exibir informação visual
  const defaultAccount = accounts.find(acc => acc.isDefault);
  const defaultCategory = categories.find(cat => cat.isDefault && cat.type === formData.type);

  return (
    <>
      <div className="flex items-center justify-between mb-6">
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
          <h1 className="text-2xl font-semibold text-white">{getTypeLabel()}</h1>
        </div>
        
        <div className="flex items-center gap-3">
          {isTypeLocked && (
            <div className="px-3 py-1 bg-[#f59e0b] text-white text-sm rounded-full">
              Tipo bloqueado
            </div>
          )}
          
          {mode === 'edit' && (
            <Button
              variant="danger"
              onClick={handleDelete}
              className="flex items-center gap-2"
              disabled={saving}
            >
              <Trash2 size={16} />
              Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Informações sobre valores padrão (apenas para criação) */}
      {mode === 'create' && (defaultAccount || defaultCategory) && (
        <Card className="mb-6 bg-blue-900/20 border-blue-600">
          <div className="flex items-start gap-3">
            <Star size={20} className="text-blue-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-300 mb-1">Valores Padrão Aplicados</h3>
              <div className="text-sm text-blue-200 space-y-1">
                {defaultAccount && (
                  <p>• Conta: {defaultAccount.name}</p>
                )}
                {defaultCategory && (
                  <p>• Categoria: {defaultCategory.name}</p>
                )}
                <p className="text-xs text-blue-300 mt-2">
                  Estes valores foram selecionados automaticamente com base nas suas configurações padrão.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ✅ INFO SOBRE AUTOCOMPLETE (apenas para criação) */}
      {mode === 'create' && (
        <Card className="mb-6 bg-purple-900/20 border-purple-600">
          <div className="flex items-start gap-3">
            <Sparkles size={20} className="text-purple-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-purple-300 mb-1">Sugestões Inteligentes</h3>
              <p className="text-sm text-purple-200">
                Digite pelo menos 3 caracteres na descrição para ver sugestões baseadas no seu histórico. 
                As mais utilizadas aparecem primeiro!
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Primeira linha: Valor (destaque) */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="w-full max-w-xs md:col-span-1">
              <CurrencyInput
                id="amount"
                label="Valor *"
                value={formData.amount}
                onChange={handleAmountChange}
                required
                disabled={saving}
              />
            </div>
            <div className="w-full max-w-xs md:col-span-4">
              {/* ✅ SUBSTITUIR Input NORMAL POR AutocompleteInput */}
              <AutocompleteInput
                id="description"
                label="Descrição *"
                value={formData.description}
                onChange={handleDescriptionChange}
                onSuggestionSelect={handleSuggestionSelect}
                fetchSuggestions={fetchAutocompleteSuggestions}
                required
                placeholder="Ex: Compra no supermercado, Recebimento de cliente..."
                disabled={saving}
                minLength={3}
                maxSuggestions={10}
              />
            </div>
          </div>

          {/* Segunda linha: Contas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(formData.type === 'EXPENSE' || formData.type === 'TRANSFER') && (
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor="fromAccountId">
                  Conta de Origem *
                </label>
                <select
                  id="fromAccountId"
                  name="fromAccountId"
                  value={formData.fromAccountId}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  required
                  disabled={saving}
                >
                  <option value="">Selecione uma conta</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.isDefault && ' ⭐'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {(formData.type === 'INCOME' || formData.type === 'TRANSFER') && (
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor="toAccountId">
                  Conta de Destino *
                </label>
                <select
                  id="toAccountId"
                  name="toAccountId"
                  value={formData.toAccountId}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  required
                  disabled={saving}
                >
                  <option value="">Selecione uma conta</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                      {account.isDefault && ' ⭐'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {formData.type !== 'TRANSFER' && (
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor="categoryId">
                  Categoria
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  value={formData.categoryId}
                  onChange={handleChange}
                  className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                  disabled={saving}
                >
                  <option value="">Sem categoria</option>
                  {categories
                    .filter(category => category.type === formData.type)
                    .map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                        {category.isDefault && ' ⭐'}
                      </option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>
          
          {/* Terceira linha: Data e Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">            
            <Input
              id="date"
              name="date"
              label="Data *"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
              disabled={saving}
            />
            
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor="status">
                Status *
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
                required
                disabled={saving}
              >
                <option value="PENDING">Pendente</option>
                <option value="COMPLETED">Concluída</option>
                <option value="CANCELED">Cancelada</option>
              </select>
            </div>
          </div>
          
          {/* Quarta linha: Tags */}
          <div>
            <Input
              id="tags"
              name="tags"
              label="Tags (separadas por vírgula)"
              value={formData.tags}
              onChange={handleChange}
              placeholder="Ex: alimentação, mercado, urgente"
              disabled={saving}
            />
          </div>
          
          {/* Quinta linha: Observações */}
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor="notes">
              Observações
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="w-full px-3 py-2 bg-[#1e2126] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring focus:border-blue-500"
              placeholder="Informações adicionais sobre a transação..."
              disabled={saving}
            />
          </div>
          
          <div className="flex justify-end gap-4 pt-6 border-t border-gray-700">
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
              variant="accent"
              disabled={saving}
              className="flex items-center gap-2"
            >
              <Save size={16} />
              {saving 
                ? 'Salvando...' 
                : mode === 'create' 
                  ? 'Criar Transação' 
                  : 'Salvar Alterações'
              }
            </Button>
          </div>
        </form>
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
    </>
  );
}