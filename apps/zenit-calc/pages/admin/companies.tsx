// frontend/pages/admin/companies.tsx - COM PROTEÇÃO DE ACESSO
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Skeleton } from '@/components/ui/Skeleton';
import { AccessGuard } from '@/components/ui/AccessGuard'; // âœ… NOVO IMPORT
import { useToast } from '@/components/ui/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions'; // âœ… NOVO IMPORT
import { Plus, Building2, Edit2, Trash2, Save, X } from 'lucide-react';
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

export default function CompaniesPage() {
  const confirmation = useConfirmation();
  const { userRole } = useAuth();
  const { canManageCompanies } = usePermissions(); // âœ… USAR HOOK DE PERMISSÃ•ES
  const { addToast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    address: ''
  });

  useEffect(() => {
    fetchCompanies();
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

  function openNewForm() {
    setEditingCompany(null);
    setFormData({ name: '', address: '' });
    setShowForm(true);
  }

  function openEditForm(company: Company) {
    setEditingCompany(company);
    setFormData({ 
      name: company.name, 
      address: company.address || '' 
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCompany(null);
    setFormData({ name: '', address: '' });
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      addToast('Nome da empresa é obrigatório', 'error');
      return;
    }

    setFormLoading(true);

    try {
      if (editingCompany) {
        // Editing existing company
        const updateData = formData.address 
          ? formData
          : { name: formData.name };
          
        await api.put(`/companies/${editingCompany.id}`, updateData);
        addToast('Empresa atualizada com sucesso', 'success');
      } else {
        // Creating new company
        await api.post('/companies', formData);
        addToast('Empresa criada com sucesso', 'success');
      }

      closeForm();
      fetchCompanies();
    } catch (err: any) {
      addToast(err.response?.data?.error || 'Erro ao salvar empresa', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete(company: Company) {
    confirmation.confirm(
      {
        title: 'Confirmar Exclusão',
        message: `Tem certeza que deseja excluir a empresa "${company.name}"? Esta ação nÃ£o pode ser desfeita.`,
        confirmText: 'Excluir',
        cancelText: 'Cancelar',
        type: 'danger'
      },
      async () => {
        try {
          await api.delete(`/companies/${company.id}`);
          addToast('Empresa excluída com sucesso', 'success');
          
          // If we were editing this company, close the form
          if (editingCompany?.id === company.id) {
            closeForm();
          }
          
          fetchCompanies();
        } catch (err: any) {
          addToast(err.response?.data?.error || 'Erro ao excluir empresa', 'error');
          throw err; // Re-throw to keep modal open on error
        }
      }
    );
  }

  return (
    <DashboardLayout>
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Empresas' }
      ]} />

      {/* âœ… PROTEÇÃO DE ACESSO - APENAS ADMIN */}
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
                    ? 'Salvar Alterações'
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

        {/* Inline form */}
        {showForm && (
          <Card className="mb-6 border-2 border-[#2563eb]">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-white">
                {editingCompany ? `Editando: ${editingCompany.name}` : 'Nova Empresa'}
              </h3>
              
              <Input
                label="Nome da Empresa"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
                placeholder="Ex: Minha Empresa Ltda"
                disabled={formLoading}
              />
              
              <Input
                label="Endereço"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                placeholder="Ex: Rua das Flores, 123 - Centro"
                disabled={formLoading}
              />

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
                    ? 'Salvar Alterações'
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
              <Button variant="outline" onClick={fetchCompanies}>
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
                <thead className="text-muted bg-elevated uppercase text-xs border-b border-soft">
                  <tr>
                    <th className="px-4 py-3 text-center w-24">Ações</th>
                    <th className="px-4 py-3 text-left">Código</th>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Endereço</th>
                    <th className="px-4 py-3 text-left">Criada em</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr 
                      key={company.id} 
                      className={`border-b border-gray-700 hover:bg-elevated ${
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
                            onClick={() => handleDelete(company)}
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

