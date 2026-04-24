import { z } from 'zod'

const appKeySchema = z.enum(['zenit-cash', 'zenit-calc', 'zenit-admin'])

export const companyEntitlementSchema = z.object({
  entitlements: z.array(
    z.object({
      appKey: appKeySchema,
      enabled: z.boolean()
    })
  )
})

export const userGrantSchema = z.object({
  grants: z.array(
    z.object({
      appKey: appKeySchema,
      granted: z.boolean()
    })
  )
})
