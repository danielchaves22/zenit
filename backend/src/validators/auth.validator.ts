import { z } from 'zod';

export const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8, 'Use pelo menos 8 caracteres.').max(72, 'Use no máximo 72 caracteres.')
}).strict().refine(value => value.currentPassword !== value.newPassword, { message: 'Escolha uma senha diferente da atual.' });

// Schema para registro (manter, mesmo que self‑signup esteja bloqueado)
export const registerSchema = z.object({
  email: z.string().email({ message: 'Email inválido.' }),
  password: z.string().min(6, { message: 'Password mínimo de 6 caracteres.' }),
  name: z.string().min(1, { message: 'Nome é obrigatório.' })
});

// Schema para login
export const loginSchema = z.object({
  email: z.string().email({ message: 'Email inválido.' }),
  password: z.string().min(1, { message: 'Password é obrigatório.' })
});

// Schema para refresh token
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10, { message: 'Refresh token inválido.' })
});
