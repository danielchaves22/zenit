import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email({ message: 'Email inválido.' }),
  password: z.string().nonempty({ message: 'Password é obrigatório.' }),
  name: z.string().min(1, { message: 'Nome é obrigatório.' }),
  companyId: z.number({ invalid_type_error: 'companyId deve ser um número.' }),
  newRole: z.enum(['ADMIN', 'SUPERUSER', 'USER']).optional()
});

export const updateUserSchema = z
  .object({
    email: z.string().email({ message: 'Email inválido.' }).optional(),
    password: z.string().nonempty({ message: 'Password não pode ser vazio.' }).optional(),
    name: z.string().min(1, { message: 'Nome é obrigatório.' }).optional(),
    companyId: z.number({ invalid_type_error: 'companyId deve ser um número.' }).optional(),
    newRole: z.enum(['ADMIN', 'SUPERUSER', 'USER']).optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Ao menos um campo deve ser fornecido para atualização.'
  });
