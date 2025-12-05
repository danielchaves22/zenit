import React from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import FinancialDashboard from '@/components/financial/Dashboard';

export default function FinancialDashboardPage() {
  return (
    <DashboardLayout title="Dashboard Financeiro">
      <Breadcrumb items={[
        { label: 'Início', href: '/' },
        { label: 'Dashboard Financeiro' }
      ]} />
      
      <FinancialDashboard />
    </DashboardLayout>
  );
}