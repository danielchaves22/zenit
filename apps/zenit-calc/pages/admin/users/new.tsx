import React from 'react'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { AccessGuard } from '@/components/ui/AccessGuard'
import { UserForm } from '@/components/admin/UserForm'

export default function NewUserPage() {
  return (
    <DashboardLayout>
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Usuarios', href: '/admin/users' },
          { label: 'Novo' }
        ]}
      />
      <AccessGuard requiredRole="SUPERUSER">
        <UserForm mode="create" />
      </AccessGuard>
    </DashboardLayout>
  )
}
