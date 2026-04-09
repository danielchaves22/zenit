import React from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { AccessGuard } from '@/components/ui/AccessGuard'
import { CompanyForm } from '@/components/admin/CompanyForm'

export default function NewCompanyPage() {
  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Empresas', href: '/admin/companies' }, { label: 'Nova' }]} />
      <AccessGuard allowedRoles={['ADMIN']}>
        <CompanyForm mode="create" />
      </AccessGuard>
    </DashboardLayout>
  )
}
