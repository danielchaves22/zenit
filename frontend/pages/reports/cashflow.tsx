// frontend/pages/reports/cashflow.tsx
import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { TrendingUp, Download, Filter, Calendar } from 'lucide-react';

export default function CashflowReportPage() {
  return (
    <DashboardLayout title="Fluxo de Caixa">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Relatórios' },
        { label: 'Fluxo de Caixa' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-white">Relatório de Fluxo de Caixa</h1>
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
        <TrendingUp size={64} className="mx-auto text-blue-400 mb-4" />
        <h2 className="text-2xl font-medium mb-4 text-white">Relatório em Desenvolvimento</h2>
        <p className="text-gray-400 mb-6 max-w-md mx-auto">
          O relatório de fluxo de caixa está sendo desenvolvido e incluirá:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
          <div className="bg-[#1a1f2b] p-4 rounded-lg">
            <h3 className="font-medium text-white mb-2">Entradas de Caixa</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Vendas à vista</li>
              <li>• Recebimentos de clientes</li>
              <li>• Outras receitas</li>
            </ul>
          </div>
          <div className="bg-[#1a1f2b] p-4 rounded-lg">
            <h3 className="font-medium text-white mb-2">Saídas de Caixa</h3>
            <ul className="text-sm text-gray-400 space-y-1">
              <li>• Pagamentos a fornecedores</li>
              <li>• Despesas operacionais</li>
              <li>• Impostos e taxas</li>
            </ul>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-6">
          Funcionalidade estará disponível na próxima versão.
        </p>
      </Card>
    </DashboardLayout>
  );
}