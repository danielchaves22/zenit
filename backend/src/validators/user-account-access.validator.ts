// backend/src/validators/user-account-access.validator.ts
import { z } from 'zod';

// Schema para conceder acesso a contas específicas
export const grantAccountAccessSchema = z.object({
  accountIds: z.array(
    z.number().int().positive('ID da conta deve ser um número positivo'),
    {
      required_error: 'Lista de IDs de contas é obrigatória',
      invalid_type_error: 'IDs das contas devem ser números'
    }
  ).min(1, 'Pelo menos uma conta deve ser especificada')
    .max(100, 'Máximo 100 contas por operação'),
});

// Schema para revogar acesso a contas específicas
export const revokeAccountAccessSchema = z.object({
  accountIds: z.array(
    z.number().int().positive('ID da conta deve ser um número positivo'),
    {
      required_error: 'Lista de IDs de contas é obrigatória',
      invalid_type_error: 'IDs das contas devem ser números'
    }
  ).min(1, 'Pelo menos uma conta deve ser especificada')
    .max(100, 'Máximo 100 contas por operação'),
});

// Schema para atualização em lote (pode ser array vazio)
export const bulkUpdateAccountAccessSchema = z.object({
  accountIds: z.array(
    z.number().int().positive('ID da conta deve ser um número positivo'),
    {
      required_error: 'Lista de IDs de contas é obrigatória (pode ser vazia)',
      invalid_type_error: 'IDs das contas devem ser números'
    }
  ).max(100, 'Máximo 100 contas por operação'),
});

// Schema para adicionar permissões no form de criação de usuário
export const userCreationWithPermissionsSchema = z.object({
  // Campos básicos do usuário (já existentes)
  email: z.string().email({ message: 'Email inválido.' }),
  password: z.string().nonempty({ message: 'Password é obrigatório.' }),
  name: z.string().min(1, { message: 'Nome é obrigatório.' }),
  companyId: z.number({ invalid_type_error: 'companyId deve ser um número.' }),
  newRole: z.enum(['ADMIN', 'SUPERUSER', 'USER']).optional(),
  
  // Novos campos para permissões (opcionais)
  accountPermissions: z.object({
    grantAllAccess: z.boolean().default(false),
    specificAccountIds: z.array(
      z.number().int().positive()
    ).optional()
  }).optional()
}).refine((data) => {
  // Se especificou permissões, deve escolher uma das opções
  if (data.accountPermissions) {
    const { grantAllAccess, specificAccountIds } = data.accountPermissions;
    
    // Se grantAllAccess é true, não deve ter specificAccountIds
    if (grantAllAccess && specificAccountIds && specificAccountIds.length > 0) {
      return false;
    }
    
    // Se grantAllAccess é false, deve ter specificAccountIds (ou nenhuma permissão)
    if (!grantAllAccess && specificAccountIds && specificAccountIds.length === 0) {
      return false;
    }
  }
  
  return true;
}, {
  message: 'Configure permissões: ou acesso total ou contas específicas, não ambos',
  path: ['accountPermissions']
});

// Tipos TypeScript derivados
export type GrantAccountAccessData = z.infer<typeof grantAccountAccessSchema>;
export type RevokeAccountAccessData = z.infer<typeof revokeAccountAccessSchema>;
export type BulkUpdateAccountAccessData = z.infer<typeof bulkUpdateAccountAccessSchema>;
export type UserCreationWithPermissions = z.infer<typeof userCreationWithPermissionsSchema>;