import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { PageLoader } from '@/components/ui/PageLoader';
import { useToast } from '@/components/ui/ToastContext';
import { Plus, Edit2, Trash2, Calendar, DollarSign } from 'lucide-react';
import api from '@/lib/api';

interface RecurringTransaction {
  id: number;
  description: string;
  amount: string;
  frequency: string;
  dayOfMonth?: number;
  nextDueDate: string;
  isActive: boolean;
  fromAccount?: { id: number; name: string };
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
}

export default function ExpensesRecurringPage() {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    frequency: 'MONTHLY',
    dayOfMonth: '5',
    fromAccountId: '',
    categoryId: '',
    notes: ''
  });

  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [recurringRes, accountsRes, categoriesRes] = await Promise.all([
        api.get('/financial/recurring?type=EXPENSE'),
        api.get('/financial/accounts'),
        api.get('/financial/categories?type=EXPENSE')
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
    
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        dayOfMonth: parseInt(formData.dayOfMonth),
        type: 'EXPENSE',
        startDate: new Date().toISOString(),
        fromAccountId: parseInt(formData.fromAccountId),
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : null
      };

      if (editingId) {
        await api.put(`/financial/recurring/${editingId}`, payload);
        addToast('Despesa fixa atualizada', 'success');
      } else {
        await api.post('/financial/recurring', payload);
        addToast('Despesa fixa criada', 'success');
      }
      
      resetForm();
      fetchData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao salvar', 'error');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Tem certeza que deseja excluir esta despesa fixa?')) return;
    
    try {
      await api.delete(`/financial/recurring/${id}`);
      addToast('Despesa fixa excluída', 'success');
      fetchData();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao excluir', 'error');
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
      frequency: 'MONTHLY',
      dayOfMonth: '5',
      fromAccountId: '',
      categoryId: '',
      notes: ''
    });
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(item: RecurringTransaction) {
    setFormData({
      description: item.description,
      amount: item.amount,
      frequency: item.frequency,
      dayOfMonth: item.dayOfMonth?.toString() || '5',
      fromAccountId: item.fromAccount?.id.toString() || '',
      categoryId: item.category?.id.toString() || '',
      notes: ''
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  const frequencyLabels: Record<string, string> = {
    DAILY: 'Diário',
    WEEKLY: 'Semanal', 
    MONTHLY: 'Mensal',
    QUARTERLY: 'Trimestral',
    YEARLY: 'Anual'
  };

  if (loading) {
    return (
      <DashboardLayout title="Despesas Fixas">
        <PageLoader message="Carregando despesas fixas..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Despesas Fixas">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Despesas' },
        { label: 'Despesas Fixas' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Despesas Fixas</h1>
        <Button 
          variant="accent" 
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2"
        >
          <Plus size={16} />
          Nova Despesa Fixa
        </Button>
      </div>

      {/* Lista de Despesas Fixas */}
      <Card>
        {recurring.length === 0 ? (
          <div className="text-center py-10">
            <Calendar size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">Nenhuma despesa fixa cadastrada</p>
            <Button 
              variant="accent" 
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Criar Primeira Despesa Fixa
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {recurring.map((item) => (
              <div key={item.id} className="border border-gray-700 rounded-lg p-4 hover:bg-[#1a1f2b]">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-