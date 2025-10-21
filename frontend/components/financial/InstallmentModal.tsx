// frontend/components/financial/InstallmentModal.tsx
import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { useToast } from '@/components/ui/ToastContext';
import { X, ShoppingBag, Calendar } from 'lucide-react';
import api from '@/lib/api';

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

interface InstallmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function InstallmentModal({ isOpen, onClose, onSuccess }: InstallmentModalProps) {
  const { addToast } = useToast();

  const [creditCards, setCreditCards] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    accountId: '',
    description: '',
    totalAmount: '',
    numberOfInstallments: 2,
    purchaseDate: new Date().toISOString().split('T')[0],
    categoryId: ''
  });

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen]);

  async function fetchData() {
    setLoading(true);
    try {
      // Buscar cartões de crédito
      const accountsResponse = await api.get('/financial/accounts?type=CREDIT_CARD');
      setCreditCards(accountsResponse.data);

      if (accountsResponse.data.length > 0) {
        setFormData(prev => ({ ...prev, accountId: accountsResponse.data[0].id.toString() }));
      }

      // Buscar categorias
      const categoriesResponse = await api.get('/financial/categories?type=EXPENSE');
      setCategories(categoriesResponse.data);
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao carregar dados', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.accountId) {
      addToast('Selecione um cartão de crédito', 'error');
      return;
    }

    if (!formData.description) {
      addToast('Digite uma descrição', 'error');
      return;
    }

    const totalAmount = parseFloat(formData.totalAmount || '0');
    if (totalAmount <= 0) {
      addToast('Digite um valor válido', 'error');
      return;
    }

    if (formData.numberOfInstallments < 2 || formData.numberOfInstallments > 48) {
      addToast('Número de parcelas deve estar entre 2 e 48', 'error');
      return;
    }

    setCreating(true);
    try {
      await api.post(`/financial/credit-cards/${formData.accountId}/installments`, {
        description: formData.description,
        totalAmount: totalAmount,
        numberOfInstallments: formData.numberOfInstallments,
        purchaseDate: new Date(formData.purchaseDate),
        categoryId: formData.categoryId ? parseInt(formData.categoryId) : undefined
      });

      const installmentAmount = totalAmount / formData.numberOfInstallments;
      addToast(
        `Parcelamento criado: ${formData.numberOfInstallments}x de ${installmentAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
        'success'
      );

      // Resetar formulário
      setFormData({
        accountId: creditCards[0]?.id.toString() || '',
        description: '',
        totalAmount: '',
        numberOfInstallments: 2,
        purchaseDate: new Date().toISOString().split('T')[0],
        categoryId: ''
      });

      if (onSuccess) onSuccess();
      onClose();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao criar parcelamento', 'error');
    } finally {
      setCreating(false);
    }
  }

  function handleChange(field: string, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  function calculateInstallmentAmount(): number {
    const total = parseFloat(formData.totalAmount || '0');
    return total / formData.numberOfInstallments;
  }

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="p-6">
        {/* Header customizado */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-accent/10 rounded-lg">
              <ShoppingBag className="w-6 h-6 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text">Compra Parcelada</h2>
              <p className="text-sm text-text-secondary">
                Crie uma compra parcelada no cartão de crédito
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-text-secondary" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-text-secondary">Carregando...</p>
          </div>
        ) : creditCards.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-text-secondary mb-4">
              Nenhum cartão de crédito encontrado
            </p>
            <p className="text-sm text-text-secondary">
              Crie um cartão de crédito primeiro
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {/* Cartão de Crédito */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Cartão de Crédito *
                </label>
                <select
                  value={formData.accountId}
                  onChange={(e) => handleChange('accountId', e.target.value)}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text"
                  required
                >
                  {creditCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Descrição *
                </label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  placeholder="Ex: Notebook Dell Inspiron 15"
                  required
                />
              </div>

              {/* Valor Total e Parcelas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Valor Total *
                  </label>
                  <CurrencyInput
                    value={formData.totalAmount}
                    onChange={(value) => handleChange('totalAmount', value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Número de Parcelas *
                  </label>
                  <Input
                    type="number"
                    min="2"
                    max="48"
                    value={formData.numberOfInstallments}
                    onChange={(e) => handleChange('numberOfInstallments', parseInt(e.target.value))}
                    required
                  />
                  <p className="text-xs text-text-secondary mt-1">
                    Mínimo: 2 | Máximo: 48
                  </p>
                </div>
              </div>

              {/* Preview do Parcelamento */}
              {formData.totalAmount && parseFloat(formData.totalAmount) > 0 && (
                <div className="p-4 bg-accent/5 border border-accent/20 rounded-lg">
                  <p className="text-sm text-text-secondary mb-1">
                    Valor de cada parcela:
                  </p>
                  <p className="text-2xl font-bold text-accent">
                    {formData.numberOfInstallments}x de{' '}
                    {calculateInstallmentAmount().toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL'
                    })}
                  </p>
                  <p className="text-xs text-text-secondary mt-2">
                    As parcelas serão distribuídas nas próximas {formData.numberOfInstallments} faturas
                  </p>
                </div>
              )}

              {/* Data da Compra */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Data da Compra
                </label>
                <Input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => handleChange('purchaseDate', e.target.value)}
                  required
                />
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">
                  Categoria (opcional)
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) => handleChange('categoryId', e.target.value)}
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-text"
                >
                  <option value="">Sem categoria</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Botões */}
            <div className="flex gap-3 justify-end mt-6 pt-6 border-t border-border">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={creating}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={creating}
              >
                {creating ? 'Criando...' : 'Criar Parcelamento'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
