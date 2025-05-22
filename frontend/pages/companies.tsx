import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/ui/Layout'
import { Card } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { useToast } from '../components/ui/ToastContext'

interface Company {
  id: string;
  name: string;
  createdAt: string;
}

export default function CompaniesPage() {
  const { token, userRole } = useAuth();
  const { addToast } = useToast();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, [token]);

  async function fetchCompanies() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Erro ao buscar empresas');
      setCompanies(await res.json());
    } catch (err: any) {
      setError(err.message || 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }

  async function createCompany() {
    if (!newCompanyName.trim()) {
      addToast('Informe um nome válido', 'error');
      return;
    }
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/companies`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newCompanyName }),
      });
      if (!res.ok) throw new Error('Erro ao criar empresa');
      setNewCompanyName('');
      setCreating(false);
      fetchCompanies();
      addToast('Empresa criada com sucesso', 'success');
    } catch (err: any) {
      addToast(err.message || 'Erro inesperado', 'error');
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-heading font-bold mb-6">Empresas</h1>

      {userRole === 'ADMIN' && (
        <div className="mb-6">
          <Button
            variant="primary"
            onClick={() => setCreating((prev) => !prev)}
          >
            {creating ? 'Cancelar' : 'Nova Empresa'}
          </Button>

          {creating && (
            <Card className="mt-4">
              <Input
                id="new-company"
                label="Nome da empresa"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
              />
              <Button variant="accent" onClick={createCompany}>
                Salvar
              </Button>
            </Card>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array(5)
            .fill(0)
            .map((_, i) => (
              <Skeleton key={i} className="h-6 w-full rounded" />
            ))}
        </div>
      ) : error ? (
        <p className="text-center text-danger">{error}</p>
      ) : (
        <Card>
          <table className="w-full">
            <thead>
              <tr className="bg-neutral">
                <th className="text-left p-2">Nome</th>
                <th className="text-left p-2">Criada em</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2">{c.name}</td>
                  <td className="p-2">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </Layout>
  );
}