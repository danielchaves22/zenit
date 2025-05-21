import { useState } from 'react';
import { Layout } from '../../components/ui/Layout';
import { Button } from '../../components/ui/Button';
import FinancialDashboard from '../../components/financial/Dashboard';
import TransactionForm from '../../components/financial/TransactionForm';

export default function FinancialPage() {
  const [view, setView] = useState<'dashboard' | 'accounts' | 'transactions' | 'categories'>('dashboard');
  const [showNewTransaction, setShowNewTransaction] = useState(false);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Cabeçalho e navegação do módulo financeiro */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center space-y-4 md:space-y-0">
          <h1 className="text-2xl font-heading font-bold">Financeiro</h1>
          
          <div className="flex flex-wrap gap-2">
            <Button
              variant={view === 'dashboard' ? 'primary' : 'outline'}
              onClick={() => {
                setView('dashboard');
                setShowNewTransaction(false);
              }}
            >
              Dashboard
            </Button>
            <Button
              variant={view === 'transactions' ? 'primary' : 'outline'}
              onClick={() => {
                setView('transactions');
                setShowNewTransaction(false);
              }}
            >
              Transações
            </Button>
            <Button
              variant={view === 'accounts' ? 'primary' : 'outline'}
              onClick={() => {
                setView('accounts');
                setShowNewTransaction(false);
              }}
            >
              Contas
            </Button>
            <Button
              variant={view === 'categories' ? 'primary' : 'outline'}
              onClick={() => {
                setView('categories');
                setShowNewTransaction(false);
              }}
            >
              Categorias
            </Button>
            <Button
              variant="accent"
              onClick={() => setShowNewTransaction(true)}
            >
              Nova Transação
            </Button>
          </div>
        </div>

        {/* Formulário de Nova Transação */}
        {showNewTransaction && (
          <TransactionForm 
            onSuccess={() => {
              setShowNewTransaction(false);
              // Atualizar a visualização atual (dashboard ou transações)
            }}
          />
        )}

        {/* Conteúdo da visualização selecionada */}
        {view === 'dashboard' && !showNewTransaction && (
          <FinancialDashboard />
        )}

        {view === 'transactions' && !showNewTransaction && (
          <div>
            <p className="text-center py-8 text-gray-500">
              A página de transações está em desenvolvimento.
            </p>
          </div>
        )}

        {view === 'accounts' && !showNewTransaction && (
          <div>
            <p className="text-center py-8 text-gray-500">
              A página de contas está em desenvolvimento.
            </p>
          </div>
        )}

        {view === 'categories' && !showNewTransaction && (
          <div>
            <p className="text-center py-8 text-gray-500">
              A página de categorias está em desenvolvimento.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
