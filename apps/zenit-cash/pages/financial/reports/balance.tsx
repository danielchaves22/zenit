// frontend/pages/financial/reports/balance.tsx
import React from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { Scale, Download, Filter } from 'lucide-react';

export default function BalanceReportPage() {
  return (
    <DashboardLayout title="Balancete">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro', href: '/financial' },
        { label: 'Relatórios', href: '/financial/reports' },
        { label: 'Balancete' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-text">Balancete de Verificação</h1>
        <div className="flex gap-2">
          <Button variant="outline" className="flex items-center gap-2">
            <Filter size={16} />
            Filtros
          </Button>
          <Button variant="accent" className="flex items-center gap-2">
            <Download size={16} />
            Exportar
          </Button>
        </div>
      </div>

      <Card className="p-8 text-center">
        <Scale size={64} className="mx-auto text-tone-purple mb-4" />
        <h2 className="text-2xl font-medium mb-4 text-text">Balancete em Desenvolvimento</h2>
        <p className="text-text-muted mb-6 max-w-md mx-auto">
          O Balancete de Verificação mostrará o saldo de todas as contas contábeis:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
          <div className="bg-elevated p-4 rounded-lg">
            <h3 className="font-medium text-text mb-2">Contas de Ativo</h3>
            <ul className="text-sm text-text-muted space-y-1">
              <li>• Caixa e Bancos</li>
              <li>• Contas a Receber</li>
              <li>• Estoques</li>
              <li>• Imobilizado</li>
            </ul>
          </div>
          <div className="bg-elevated p-4 rounded-lg">
            <h3 className="font-medium text-text mb-2">Contas de Passivo</h3>
            <ul className="text-sm text-text-muted space-y-1">
              <li>• Contas a Pagar</li>
              <li>• Empréstimos</li>
              <li>• Patrimônio Líquido</li>
              <li>• Provisões</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-text-subtle mt-6">
          Funcionalidade estará disponível na próxima versão.
        </p>
      </Card>
    </DashboardLayout>
  );
}