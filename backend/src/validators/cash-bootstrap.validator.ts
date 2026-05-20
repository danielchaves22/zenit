import { z } from 'zod';

export const selectCashCompanySchema = z.object({
  companyId: z.number({ invalid_type_error: 'companyId deve ser um numero.' }).int().positive()
});
