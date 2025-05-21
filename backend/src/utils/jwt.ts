import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

/**
 * Gera um token JWT com os dados do usuário
 * Versão simplificada: um usuário pertence a apenas uma empresa
 */
export function generateToken(payload: {
  userId: number;
  companyId: number;  // Agora apenas um ID de empresa, não um array
  role: string;
}): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Gera um refresh token com validade de 7 dias
 */
export function generateRefreshToken(payload: {
  userId: number;
  companyId: number;
  role: string;
}): string {
  const { password, ...payloadWithoutSensitiveData } = payload as any;
  return jwt.sign(payloadWithoutSensitiveData, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verifica e decodifica um token JWT
 */
export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}