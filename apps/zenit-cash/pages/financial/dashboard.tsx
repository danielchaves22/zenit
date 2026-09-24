import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import FinancialAnalysis from '@/components/financial/FinancialAnalysis';

export default function FinancialDashboardPage() {
  return (
    <DashboardLayout title="Análise financeira">
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Análise financeira' }
      ]} />
      
      <FinancialAnalysis />
    </DashboardLayout>
  );
}
