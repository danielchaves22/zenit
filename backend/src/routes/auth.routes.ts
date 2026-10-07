import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  getCurrentUser,
  validateToken,
  logout,
  changeOwnPassword
} from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { authMiddleware } from '../middlewares/auth.middleware';
import { loginRateLimitMiddleware } from '../middlewares/rate-limit.middleware';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changeOwnPasswordSchema
} from '../validators/auth.validator';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', loginRateLimitMiddleware, validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);

router.get('/me', authMiddleware, getCurrentUser);
router.get('/validate', authMiddleware, validateToken);
router.post('/logout', authMiddleware, logout);
router.put('/password', authMiddleware, validate(changeOwnPasswordSchema, { source: 'body' }), changeOwnPassword);

export default router;
