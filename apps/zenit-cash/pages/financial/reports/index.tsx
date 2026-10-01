// frontend/pages/financial/reports/index.tsx
import React from 'react';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { Card } from '../../../components/ui/Card';
import { Breadcrumb } from '../../../components/ui/Breadcrumb';
import { TrendingUp, BarChart3, Scale, FileText, Calendar, Download } from 'lucide-react';
import Link from 'next/link';

export default function FinancialReportsPage() {
  const reports = [
    {
      title: 'Fluxo de Caixa',
      description: 'Acompanhe entradas e saídas de caixa por período',
      icon: <TrendingUp size={32} className="text-tone-blue" />,
      href: '/financial/reports/cashflow',
      color: 'blue',
      features: ['Entradas vs Saídas', 'Projeções', 'Análise por período']
    },
    {
      title: 'Demonstrativo de Resultado (DRE)',
      description: 'Visão completa da performance financeira da empresa',
      icon: <BarChart3 size={32} className="text-tone-green" />,
      href: '/financial/reports/income',
      color: 'green',
      features: ['Receitas', 'Custos e Despesas', 'Resultado Líquido']
    },
    {
      title: 'Balancete de Verificação',
      description: 'Saldos detalhados de todas as contas contábeis',
      icon: <Scale size={32} className="text-tone-purple" />,
      href: '/financial/reports/balance',
      color: 'purple',
      features: ['Contas de Ativo', 'Contas de Passivo', 'Patrimônio Líquido']
    }
  ];

  return (
    <DashboardLayout title="Relatórios Financeiros">
      <Breadcrumb items={[
        { label: 'Dashboard', href: '/' },
        { label: 'Financeiro', href: '/financial' },
        { label: 'Relatórios' }
      ]} />

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text">Relatórios Financeiros</h1>
          <p className="text-text-muted mt-1">Análises e demonstrativos para tomada de decisão</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-background text-text-muted rounded-lg hover:bg-elevated transition-colors">
            <Calendar size={16} />
            Período
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-accent text-on-accent rounded-lg hover:bg-accent-hover transition-colors">
            <Download size={16} />
            Exportar Todos
          </button>
        </div>
      </div>

      {/* Cards de Relatórios */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {reports.map((report, index) => (
          <Link key={index} href={report.href} className="block">
            <Card className="p-6 hover:bg-elevated transition-colors cursor-pointer group">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-background rounded-lg group-hover:bg-elevated transition-colors">
                  {report.icon}
                </div>
                <span className="px-2 py-1 bg-elevated text-text-muted text-xs rounded-full">
                  Em breve
                </span>
              </div>
              
              <h3 className="text-lg font-semibold text-text mb-2 group-hover:text-accent transition-colors">
                {report.title}
              </h3>
              
              <p className="text-text-muted text-sm mb-4">
                {report.description}
              </p>
              
              <div className="space-y-1">
                {report.features.map((feature, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs text-text-subtle">
                    <div className="w-1 h-1 bg-elevated rounded-full" />
                    {feature}
                  </div>
                ))}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Estatísticas Rápidas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-tone-green mb-1">R$ 45.2K</div>
          <div className="text-sm text-text-muted">Receitas (mês)</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-tone-red mb-1">R$ 32.8K</div>
          <div className="text-sm text-text-muted">Despesas (mês)</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-tone-blue mb-1">R$ 12.4K</div>
          <div className="text-sm text-text-muted">Resultado (mês)</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-accent mb-1">27.4%</div>
          <div className="text-sm text-text-muted">Margem Líquida</div>
        </Card>
      </div>

      {/* Informações Adicionais */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText size={20} className="text-accent" />
          <h3 className="text-lg font-medium text-text">Sobre os Relatórios</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-text mb-2">Recursos Disponíveis</h4>
            <ul className="text-sm text-text-muted space-y-1">
              <li>• Filtragem por período personalizado</li>
              <li>• Exportação em PDF e Excel</li>
              <li>• Comparação entre períodos</li>
              <li>• Gráficos interativos</li>
              <li>• Análises automáticas</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-text mb-2">Próximas Atualizações</h4>
            <ul className="text-sm text-text-muted space-y-1">
              <li>• Relatório de Contas a Pagar/Receber</li>
              <li>• Análise de Rentabilidade</li>
              <li>• Dashboard Executivo</li>
              <li>• Relatórios Customizados</li>
              <li>• Envio Automático por Email</li>
            </ul>
          </div>
        </div>
      </Card>
    </DashboardLayout>
  );
}