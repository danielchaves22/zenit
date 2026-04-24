import { z } from 'zod'

const appGrantSchema = z.object({
  companyId: z.number(),
  appKey: z.enum(['zenit-cash', 'zenit-calc', 'zenit-admin']),
  granted: z.boolean().optional()
})

export const createUserSchema = z.object({
  email: z.string().email({ message: 'Email invalido.' }),
  password: z.string().nonempty({ message: 'Password e obrigatorio.' }),
  name: z.string().min(1, { message: 'Nome e obrigatorio.' }),
  companyId: z.number({ invalid_type_error: 'companyId deve ser um numero.' }).optional(),
  companies: z
    .array(
      z.object({
        companyId: z.number(),
        role: z.enum(['ADMIN', 'SUPERUSER', 'USER']),
        manageFinancialAccounts: z.boolean().optional(),
        manageFinancialCategories: z.boolean().optional()
      })
    )
    .optional(),
  appGrants: z.array(appGrantSchema).optional(),
  newRole: z.enum(['ADMIN', 'SUPERUSER', 'USER']).optional()
})

export const updateUserSchema = z
  .object({
    email: z.string().email({ message: 'Email invalido.' }).optional(),
    password: z.string().nonempty({ message: 'Password nao pode ser vazio.' }).optional(),
    name: z.string().min(1, { message: 'Nome e obrigatorio.' }).optional(),
    companyId: z.number({ invalid_type_error: 'companyId deve ser um numero.' }).optional(),
    companies: z
      .array(
        z.object({
          companyId: z.number(),
          role: z.enum(['ADMIN', 'SUPERUSER', 'USER']),
          manageFinancialAccounts: z.boolean().optional(),
          manageFinancialCategories: z.boolean().optional()
        })
      )
      .optional(),
    appGrants: z.array(appGrantSchema).optional(),
    newRole: z.enum(['ADMIN', 'SUPERUSER', 'USER']).optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: 'Ao menos um campo deve ser fornecido para atualizacao.'
  })
