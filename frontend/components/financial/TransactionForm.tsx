import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { useToast } from '../ui/ToastContext';
import api from '../../lib/api';

interface Account {
  id: number;
  name: string;
  type: string;
}

interface Category {
  id: number;
  name: string;
  type: string;
  color: string;
}

interface TransactionFormProps {
  transactionId?: number;
  onSuccess?: () => void;
}

export default function TransactionForm({ transactionId, onSuccess }: TransactionFormProps) {
  const { token } = useAuth();
  const { addToast } = useToast();
  
  // Estados para dados da transação
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    type: 'EXPENSE',
    status: 'COMPLETED',
    notes: '',
    fromAccountId: '',
    toAccountId: '',
    categoryId: '',
    tags: ''
  });
  
  // Estados para dados de referência
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!token) return;
    
    // Carregar contas e categorias
    fetchAccounts();
    fetchCategories();
    
    // Se for edição, carregar dados da transação
    if (transactionId) {
      setIsEditing(true);
      fetchTransaction(transactionId);
    }
  }, [token, transactionId]);

  async function fetchAccounts() {
    try {
      const response = await api.get('/financial/accounts');
      setAccounts(response.data);
      
      // Se for uma nova transação, pré-selecionar a primeira conta
      if (!transactionId && response.data.length > 0) {
        if (formData.type === 'EXPENSE' || formData.type === 'TRANSFER') {
          setFormData(prev => ({ ...prev, fromAccountId: response.data[0].id.toString() }));
        }
        if (formData.type === 'INCOME' || formData.type === 'TRANSFER') {
          setFormData(prev => ({ ...prev, toAccountId: response.data[0].id.toString() }));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar contas:', error);
    }
  }

  async function fetchCategories() {
    try {
      const response = await api.get('/financial/categories');
      setCategories(response.data);
      
      // Se for uma nova transação, pré-selecionar a primeira categoria do tipo adequado
      if (!transactionId && response.data.length > 0) {
        const filteredCategories = response.data.filter(
          (c: Category) => c.type === formData.type
        );
        
        if (filteredCategories.length > 0) {
          setFormData(prev => ({ ...prev, categoryId: filteredCategories[0].id.toString() }));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar categorias:', error);
    }
  }

  async function fetchTransaction(id: number) {
    try {
      const response = await api.get(`/financial/transactions/${id}`);
      const transaction = response.data;
      
      setFormData({
        description: transaction.description,
        amount: transaction.amount,
        date: new Date(transaction.date).toISOString().split('T')[0],
        type: transaction.type,
        status: transaction.status,
        notes: transaction.notes || '',
        fromAccountId: transaction.fromAccountId ? transaction.fromAccountId.toString() : '',
        toAccountId: transaction.toAccountId ? transaction.toAccountId.toString() : '',
        categoryId: transaction.categoryId ? transaction.categoryId.toString() : '',
        tags: transaction.tags ? transaction.tags.map((t: any) => t.name).join(', ') : ''
      });
    } catch (error) {
      console.error('Erro ao carregar transação:', error);
      addToast('Erro ao carregar dados da transação', 'error');
    }
  }

  // Tratar mudanças nos campos do formulário
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    
    // Tratamento especial para o tipo de transação
    if (name === 'type') {
      const newType = value;
      
      // Resetar contas de acordo com o tipo
      if (newType === 'EXPENSE') {
        setFormData(prev => ({ ...prev, type: newType, toAccountId: '' }));
      } else if (newType === 'INCOME') {
        setFormData(prev => ({ ...prev, type: newType, fromAccountId: '' }));
      } else {
        setFormData(prev => ({ ...prev, type: newType }));
      }
      
      // Filtrar categorias por tipo
      const filteredCategories = categories.filter(c => c.type === newType);
      if (filteredCategories.length > 0) {
        setFormData(prev => ({ ...prev, categoryId: filteredCategories[0].id.toString() }));
      } else {
        setFormData(prev => ({ ...prev, categoryId: '' }));
      }
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Enviar formulário
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Preparar dados para envio
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount.replace(/[^\d.-]/g, '')),
        fromAccountId: formData.fromAccountId ? parseInt(formData.fromAccountId) : null,
        toAccountId: formData.toAccountId ? parseInt(formData.toAccountId) : null,
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null,
        tags: formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
      };
      
      if (isEditing) {
        await api.put(`/financial/transactions/${transactionId}`, payload);
        addToast('Transação atualizada com sucesso', 'success');
      } else {
        await api.post('/financial/transactions', payload);
        addToast('Transação criada com sucesso', 'success');
      }
      
      // Resetar formulário ou chamar callback de sucesso
      if (onSuccess) {
        onSuccess();
      } else {
        // Se não houver callback, apenas limpar o formulário para uma nova transação
        setFormData({
          description: '',
          amount: '',
          date: new Date().toISOString().split('T')[0],
          type: 'EXPENSE',
          status: 'COMPLETED',
          notes: '',
          fromAccountId: accounts.length > 0 ? accounts[0].id.toString() : '',
          toAccountId: '',
          categoryId: '',
          tags: ''
        });
      }
    } catch (error: any) {
      console.error('Erro ao salvar transação:', error);
      addToast(
        error.response?.data?.error || 'Erro ao salvar transação',
        'error'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-bold mb-6">
        {isEditing ? 'Editar Transação' : 'Nova Transação'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Input
              id="description"
              name="description"
              label="Descrição"
              value={formData.description}
              onChange={handleChange}
              required
            />
          </div>
          
          <div>
            <Input
              id="amount"
              name="amount"
              label="Valor"
              type="text"
              value={formData.amount}
              onChange={handleChange}
              required
              placeholder="0,00"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Input
              id="date"
              name="date"
              label="Data"
              type="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="type">
              Tipo
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
              required
            >
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
              <option value="TRANSFER">Transferência</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="status">
              Status
            </label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
              required
            >
              <option value="PENDING">Pendente</option>
              <option value="COMPLETED">Concluída</option>
              <option value="CANCELED">Cancelada</option>
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(formData.type === 'EXPENSE' || formData.type === 'TRANSFER') && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="fromAccountId">
                Conta de Origem
              </label>
              <select
                id="fromAccountId"
                name="fromAccountId"
                value={formData.fromAccountId}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
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
          
          {(formData.type === 'INCOME' || formData.type === 'TRANSFER') && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="toAccountId">
                Conta de Destino
              </label>
              <select
                id="toAccountId"
                name="toAccountId"
                value={formData.toAccountId}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
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
          
          {formData.type !== 'TRANSFER' && (
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="categoryId">
                Categoria
              </label>
              <select
                id="categoryId"
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
              >
                <option value="">Sem categoria</option>
                {categories
                  .filter(category => category.type === formData.type)
                  .map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))
                }
              </select>
            </div>
          )}
        </div>
        
        <div>
          <Input
            id="tags"
            name="tags"
            label="Tags (separadas por vírgula)"
            value={formData.tags}
            onChange={handleChange}
            placeholder="Ex: alimentação, mercado"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="notes">
            Observações
          </label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
          ></textarea>
        </div>
        
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (onSuccess) onSuccess();
            }}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isLoading}
          >
            {isLoading 
              ? 'Salvando...' 
              : isEditing 
                ? 'Atualizar Transação' 
                : 'Criar Transação'
            }
          </Button>
        </div>
      </form>
    </Card>
  );
}
