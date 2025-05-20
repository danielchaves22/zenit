// backend/src/swagger.ts

import { Express } from 'express';
import swaggerJsdoc, { Options } from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Zenit Core API',
      version: '1.0.0',
      description: 'Documentação da API do Core (Zenit)'
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Servidor local' }
    ],
    components: {
      schemas: {
        AuthRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' }
          }
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            message: { type: 'string' }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            email: { type: 'string' },
            name: { type: 'string' },
            role: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        NewUser: {
          type: 'object',
          required: ['email', 'password', 'name', 'companyId'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            name: { type: 'string' },
            companyId: { type: 'integer' },
            newRole: { type: 'string', enum: ['ADMIN', 'SUPERUSER', 'USER'] }
          }
        },
        Company: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' },
            address: { type: 'string' },
            code: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' }
          }
        },
        NewCompany: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            address: { type: 'string' }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.ts']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
