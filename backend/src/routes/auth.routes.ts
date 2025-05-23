// backend/src/routes/auth.routes.ts - ROTAS ATUALIZADAS
import { Router } from 'express';
import { 
  login, 
  refreshToken, 
  getCurrentUser, 
  validateToken, 
  logout 
} from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';
import { loginRateLimitMiddleware } from '../middlewares/rate-limit.middleware';
import { 
  loginSchema, 
  refreshTokenSchema 
} from '../validators/auth.validator';

const router = Router();

// Rotas públicas
router.post('/login', loginRateLimitMiddleware, validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

// Rotas protegidas (requerem auth)
router.get('/me', authMiddleware, getCurrentUser);
router.get('/validate', authMiddleware, validateToken);
router.post('/logout', authMiddleware, logout);

export default router;