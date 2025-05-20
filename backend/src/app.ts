import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import companyRoutes from './routes/company.routes';

import { authMiddleware } from './middlewares/auth.middleware';
import { tenantMiddleware } from './middlewares/tenant.middleware';

import { metricsMiddleware, metricsEndpoint } from './metrics';
import { setupSwagger } from './swagger';

const app = express();

// 1) Métricas Prometheus
app.use(metricsMiddleware);

// 2) CORS + body parsing
app.use(cors());
app.use(json());
app.use(urlencoded({ extended: true }));

// 3) Swagger (opcional)
setupSwagger(app);

// 4) Endpoint de métricas
app.get('/metrics', metricsEndpoint);

// 5) Rotas públicas de autenticação
app.use('/api/auth', authRoutes);

// 6) Middlewares de segurança
app.use(authMiddleware);    // <– verifica JWT e preenche req.user
app.use(tenantMiddleware);  // <– verifica req.user.companyIds

// 7) Rotas protegidas
app.use('/api/users',    userRoutes);
app.use('/api/companies', companyRoutes);

export default app;
