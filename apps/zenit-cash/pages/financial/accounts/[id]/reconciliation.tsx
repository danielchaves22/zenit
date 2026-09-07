import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useAuth } from '@/contexts/AuthContext';
import BankReconciliationWorkspace from '@/components/financial/BankReconciliationWorkspace';

export default function BankReconciliationPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  const previous = new Date(); previous.setDate(1); previous.setMonth(previous.getMonth() - 1);
  const fallbackMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
  const month = typeof router.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(router.query.month) ? router.query.month : fallbackMonth;
  const accountId = Number(router.query.id);
  return <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS"><DashboardLayout title="Conciliação bancária">
    <Breadcrumb items={[{ label: 'Financeiro' }, { label: 'Contas', href: '/financial/accounts' }, { label: 'Conciliação bancária' }]} />
    {router.isReady && accountId > 0 && companyId && <BankReconciliationWorkspace key={`${companyId}:${accountId}:${month}`} accountId={accountId} month={month}
      onMonthChange={value => void router.push({ pathname: '/financial/accounts/[id]/reconciliation', query: { id: accountId, month: value } }, undefined, { shallow: true })} />}
  </DashboardLayout></PageGuard>;
}
