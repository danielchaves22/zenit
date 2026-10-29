import React from 'react';
import { useRouter } from 'next/router';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useAuth } from '@/contexts/AuthContext';
import BankReconciliationV2Workspace from '@/components/financial/BankReconciliationV2Workspace';
import { bankDiagnosisLabels } from '@/components/financial/BankGuidedQueue';

export default function GuidedBankReconciliationPage() {
  const router = useRouter();
  const { companyId } = useAuth();
  const previous = new Date(); previous.setDate(1); previous.setMonth(previous.getMonth() - 1);
  const fallbackMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
  const month = typeof router.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(router.query.month) ? router.query.month : fallbackMonth;
  const accountId = Number(router.query.id), initialFocusId = Number(router.query.focus) || undefined;
  const requestedPage = Number(router.query.page);
  const initialPage = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100000 ? requestedPage : 1;
  const initialFilter = typeof router.query.filter === 'string' && ['PENDING', 'CONFIRMED', 'IGNORED', 'ALL', ...Object.keys(bankDiagnosisLabels)].includes(router.query.filter) ? router.query.filter : 'PENDING';
  return <PageGuard requiredRole="USER" requiredPermission="FINANCIAL_ACCOUNTS"><DashboardLayout title="Nova conciliação">
    <div className="flex min-h-full flex-col gap-3">
      <Breadcrumb items={[{ label: 'Financeiro' }, { label: 'Contas', href: '/financial/accounts' }, { label: 'Nova conciliação' }]} />
      {router.isReady && accountId > 0 && companyId && <BankReconciliationV2Workspace key={`${companyId}:${accountId}:${month}`} accountId={accountId} month={month} initialFocusId={initialFocusId} initialPage={initialPage} initialFilter={initialFilter}
        onMonthChange={value => void router.push({ pathname: '/financial/accounts/[id]/reconciliation-v2', query: { id: accountId, month: value } }, undefined, { shallow: true })} />}
    </div>
  </DashboardLayout></PageGuard>;
}
