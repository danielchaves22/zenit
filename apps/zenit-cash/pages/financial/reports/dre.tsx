// frontend/pages/financial/reports/income.tsx
import React from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { BarChart3, Download, Filter } from 'lucide-react';

export default function IncomeReportPage() {
  return (
    <DashboardLayout title="DRE">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro', href: '/financial' },
        { label: 'Relatórios', href: '/financial/reports' },
        { label: 'DRE' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-text">Demonstrativo de Resultado (DRE)</h1>
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
        <BarChart3 size={64} className="mx-auto text-tone-green mb-4" />
        <h2 className="text-2xl font-medium mb-4 text-text">DRE em Desenvolvimento</h2>
        <p className="text-text-muted mb-6 max-w-md mx-auto">
          O Demonstrativo de Resultado incluirá uma visão completa da performance financeira:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto text-left">
          <div className="bg-elevated p-4 rounded-lg">
            <h3 className="font-medium text-text mb-2">Receitas</h3>
            <ul className="text-sm text-text-muted space-y-1">
              <li>• Receita Bruta</li>
              <li>• Deduções</li>
              <li>• Receita Líquida</li>
            </ul>
          </div>
          <div className="bg-elevated p-4 rounded-lg">
            <h3 className="font-medium text-text mb-2">Custos e Despesas</h3>
            <ul className="text-sm text-text-muted space-y-1">
              <li>• Custos Diretos</li>
              <li>• Despesas Operacionais</li>
              <li>• Despesas Financeiras</li>
            </ul>
          </div>
          <div className="bg-elevated p-4 rounded-lg">
            <h3 className="font-medium text-text mb-2">Resultado</h3>
            <ul className="text-sm text-text-muted space-y-1">
              <li>• EBITDA</li>
              <li>• Resultado Operacional</li>
              <li>• Lucro Líquido</li>
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