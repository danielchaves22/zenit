import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';

export function generateToken(payload: object): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

export function verifyToken(token: string): any {
  return jwt.verify(token, JWT_SECRET);
}
