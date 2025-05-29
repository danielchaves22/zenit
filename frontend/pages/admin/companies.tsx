// frontend/pages/admin/companies.tsx
import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { PageLoader } from '../../components/ui/PageLoader';
import { useToast } from '../../components/ui/ToastContext';
import { useAuth } from '../../contexts/AuthContext';
import { Plus, Building2, Edit2, Trash2 } from 'lucide-react';
import api from '../../lib/api';

interface Company {
  id: number;
  name: string;
  address?: string;
  code: number;
  createdAt: string;
  updatedAt: string;
}

export default function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', address: '' });
  const [formLoading, setFormLoading] = useState(false);
  
  const { userRole } = useAuth();
  const { addToast } = useToast();

  useEffect(() => {
    fetchCompanies();
  }, []);

  async function fetchCompanies() {
    try {
      setLoading(true);
      const response = await api.get('/companies');
      setCompanies(response.data);
    } catch (error) {
      addToast('Erro ao carregar empresas', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormLoading(true);

    try {
      await api.post('/companies', formData);
      addToast('Empresa criada com sucesso', 'success');
      setFormData({ name: '', address: '' });
      setShowForm(false);
      fetchCompanies();
    } catch (error: any) {
      addToast(error.response?.data?.error || 'Erro ao criar empresa', 'error');
    } finally {
      setFormLoading(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Gestão de Empresas">
        <PageLoader message="Carregando empresas..." />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Gestão de Empresas">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Administração' },
        { label: 'Empresas' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Gestão de Empresas</h1>
        {userRole === 'ADMIN' && (
          <Button 
            variant="accent" 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2"
          >
            <Plus size={16} />
            Nova Empresa
          </Button>
        )}
      </div>

      <Card>
        {companies.length === 0 ? (
          <div className="text-center py-10">
            <Building2 size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-400 mb-4">Nenhuma empresa cadastrada</p>
            {userRole === 'ADMIN' && (
              <Button 
                variant="accent" 
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2"
              >
                <Plus size={16} />
                Criar Primeira Empresa
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="text-gray-400 bg-[#0f1419] uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Código</th>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Endereço</th>
                  <th className="px-4 py-3 text-left">Criada em</th>
                  {userRole === 'ADMIN' && (
                    <th className="px-4 py-3 text-center">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => (
                  <tr key={company.id} className="border-b border-gray-700 hover:bg-[#1a1f2b]">
                    <td className="px-4 py-3">
                      <span className="font-mono text-[#f59e0b] font-medium">
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
                    {userRole === 'ADMIN' && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-center">
                          <button
                            className="p-1 text-gray-300 hover:text-white"
                            title="Editar"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Excluir"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal de Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#151921] rounded-lg max-w-md w-full border border-gray-700">
            <div className="p-6 border-b border-gray-700">
              <h3 className="text-xl font-semibold text-white">Nova Empresa</h3>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6">
              <Input
                label="Nome da Empresa"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                required
              />
              
              <Input
                label="Endereço"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
              />
              
              <div className="flex gap-3 mt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setShowForm(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  variant="accent"
                  disabled={formLoading}
                  className="flex-1"
                >
                  {formLoading ? 'Criando...' : 'Criar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}