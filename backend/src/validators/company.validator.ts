import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(1, { message: 'Nome é obrigatório.' }),
  address: z.string().optional()
});

export const updateCompanySchema = z
  .object({
    name: z.string().min(1, { message: 'Nome é obrigatório.' }).optional(),
    address: z.string().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Ao menos um campo deve ser fornecido para atualização.'
  });
