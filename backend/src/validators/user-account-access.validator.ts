// backend/src/validators/user-account-access.validator.ts
import { z } from 'zod'

export const grantAccountAccessSchema = z.object({
  accountIds: z
    .array(z.number().int().positive('ID da conta deve ser um numero positivo'), {
      required_error: 'Lista de IDs de contas e obrigatoria',
      invalid_type_error: 'IDs das contas devem ser numeros'
    })
    .min(1, 'Pelo menos uma conta deve ser especificada')
    .max(100, 'Maximo 100 contas por operacao')
})

export const revokeAccountAccessSchema = z.object({
  accountIds: z
    .array(z.number().int().positive('ID da conta deve ser um numero positivo'), {
      required_error: 'Lista de IDs de contas e obrigatoria',
      invalid_type_error: 'IDs das contas devem ser numeros'
    })
    .min(1, 'Pelo menos uma conta deve ser especificada')
    .max(100, 'Maximo 100 contas por operacao')
})

export const bulkUpdateAccountAccessSchema = z.object({
  accountIds: z
    .array(z.number().int().positive('ID da conta deve ser um numero positivo'), {
      required_error: 'Lista de IDs de contas e obrigatoria (pode ser vazia)',
      invalid_type_error: 'IDs das contas devem ser numeros'
    })
    .max(100, 'Maximo 100 contas por operacao')
})

export const userCreationWithPermissionsSchema = z
  .object({
    email: z.string().email({ message: 'Email invalido.' }),
    password: z.string().nonempty({ message: 'Password e obrigatorio.' }),
    name: z.string().min(1, { message: 'Nome e obrigatorio.' }),
    companyId: z.number({ invalid_type_error: 'companyId deve ser um numero.' }).optional(),
    companies: z
      .array(
        z.object({
          companyId: z.number(),
          role: z.enum(['ADMIN', 'SUPERUSER', 'USER'])
        })
      )
      .optional(),
    newRole: z.enum(['ADMIN', 'SUPERUSER', 'USER']).optional(),
    manageFinancialAccounts: z.boolean().optional(),
    manageFinancialCategories: z.boolean().optional(),
    accountPermissions: z
      .object({
        grantAllAccess: z.boolean().default(false),
        specificAccountIds: z.array(z.number().int().positive()).optional()
      })
      .optional(),
    appGrants: z
      .array(
        z.object({
          companyId: z.number(),
          appKey: z.enum(['zenit-cash', 'zenit-calc', 'zenit-admin']),
          granted: z.boolean().optional()
        })
      )
      .optional()
  })
  .refine(data => {
    if (!data.companyId && (!data.companies || data.companies.length === 0)) {
      return false
    }

    if (data.accountPermissions) {
      const { grantAllAccess, specificAccountIds } = data.accountPermissions
      if (grantAllAccess && specificAccountIds && specificAccountIds.length > 0) {
        return false
      }
      if (!grantAllAccess && specificAccountIds && specificAccountIds.length === 0) {
        return false
      }
    }

    return true
  }, {
    message: 'Configure permissoes: ou acesso total ou contas especificas, nao ambos',
    path: ['accountPermissions']
  })
  .refine(data => !!data.companyId || (data.companies && data.companies.length > 0), {
    message: 'Informe companyId ou companies',
    path: ['companyId']
  })

export type GrantAccountAccessData = z.infer<typeof grantAccountAccessSchema>
export type RevokeAccountAccessData = z.infer<typeof revokeAccountAccessSchema>
export type BulkUpdateAccountAccessData = z.infer<typeof bulkUpdateAccountAccessSchema>
export type UserCreationWithPermissions = z.infer<typeof userCreationWithPermissionsSchema>
