jest.mock('../../src/lib/prisma', () => ({ __esModule: true, default: {
  user: { findUnique: jest.fn() },
  assistantDefaults: { findUniqueOrThrow: jest.fn(), update: jest.fn() }
} }));
import express from 'express';
import request from 'supertest';
import prisma from '../../src/lib/prisma';
import { platformAdminMiddleware } from '../../src/middlewares/platform-admin.middleware';
import router from '../../src/routes/admin-assistant-defaults.routes';
import AssistantDefaultsService from '../../src/services/assistant-defaults.service';

const path = '/api/admin/assistant-defaults';
const globalSettings = { model: 'gpt-6.2-sol', reasoningEffort: 'low' } as const;
const app = express();
app.use(express.json(), (req, _res, next) => {
  req.user = { userId: 8, role: 'ADMIN' } as typeof req.user;
  next();
});
app.use('/api', platformAdminMiddleware);
app.use(path, router);

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ role: 'ADMIN' } as any);
});

it('protects platform policy from tenant scopes and non-platform administrators', async () => {
  expect((await request(app).put(path).set('X-App-Key', 'zenit-cash').send(globalSettings)).status).toBe(403);
  jest.mocked(prisma.user.findUnique).mockResolvedValue({ role: 'USER' } as any);
  expect((await request(app).get(path).set('X-App-Key', 'zenit-admin')).status).toBe(403);
  expect(prisma.assistantDefaults.update).not.toHaveBeenCalled();
});

it('loads and changes both settings together without a company', async () => {
  jest.mocked(prisma.assistantDefaults.findUniqueOrThrow).mockResolvedValue(globalSettings as any);
  expect((await request(app).get(path).set('X-App-Key', 'zenit-admin')).body).toEqual(globalSettings);
  const legacy = { model: 'gpt-4o-mini', reasoningEffort: null };
  jest.mocked(prisma.assistantDefaults.update).mockResolvedValue(legacy as any);
  expect((await request(app).put(path).set('X-App-Key', 'zenit-admin').send(legacy)).body).toEqual(legacy);
  expect(prisma.assistantDefaults.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1 }, data: legacy }));
});

it('rejects unsupported reasoning, missing levels and unknown fields before saving', async () => {
  for (const body of [{ model: 'gpt-4o-mini', reasoningEffort: 'low' }, { model: 'gpt-6.2-sol' },
    { ...globalSettings, reasoningEffort: 'fast' }, { ...globalSettings, companyId: 7 }]) {
    expect((await request(app).put(path).set('X-App-Key', 'zenit-admin').send(body)).status).toBe(400);
  }
  expect(prisma.assistantDefaults.update).not.toHaveBeenCalled();
});

it('inherits only for unpinned companies and preserves effort compatibility for explicit models', async () => {
  jest.mocked(prisma.assistantDefaults.findUniqueOrThrow).mockResolvedValue(globalSettings as any);
  await expect(AssistantDefaultsService.resolveForCompany(null)).resolves.toEqual(globalSettings);
  await expect(AssistantDefaultsService.resolveForCompany('gpt-6-luna')).resolves.toEqual({ model: 'gpt-6-luna', reasoningEffort: 'none' });
  await expect(AssistantDefaultsService.resolveForCompany('gpt-4o-mini')).resolves.toEqual({ model: 'gpt-4o-mini', reasoningEffort: null });
  expect(prisma.assistantDefaults.findUniqueOrThrow).toHaveBeenCalledTimes(1);
});
