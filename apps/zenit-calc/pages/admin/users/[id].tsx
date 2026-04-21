import React from 'react'
import { useRouter } from 'next/router'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { AccessGuard } from '@/components/ui/AccessGuard'
import { UserForm } from '@/components/admin/UserForm'

export default function EditUserPage() {
  const router = useRouter()
  const { id } = router.query as { id?: string }

  return (
    <DashboardLayout>
      <Breadcrumb
        items={[
          { label: 'Inicio', href: '/' },
          { label: 'Usuarios', href: '/admin/users' },
          { label: 'Editar' }
        ]}
      />
      <AccessGuard requiredRole="SUPERUSER">
        <UserForm mode="edit" userId={id} />
      </AccessGuard>
    </DashboardLayout>
  )
}
