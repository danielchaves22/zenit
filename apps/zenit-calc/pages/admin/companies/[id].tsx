import React from 'react'
import { useRouter } from 'next/router'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { AccessGuard } from '@/components/ui/AccessGuard'
import { CompanyForm } from '@/components/admin/CompanyForm'

export default function EditCompanyPage() {
  const router = useRouter()
  const { id } = router.query as { id?: string }

  return (
    <DashboardLayout>
      <Breadcrumb items={[{ label: 'Início', href: '/' }, { label: 'Empresas', href: '/admin/companies' }, { label: 'Editar' }]} />
      <AccessGuard allowedRoles={['ADMIN']}>
        <CompanyForm mode="edit" companyId={id} />
      </AccessGuard>
    </DashboardLayout>
  )
}
