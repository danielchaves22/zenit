import { z } from 'zod';

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