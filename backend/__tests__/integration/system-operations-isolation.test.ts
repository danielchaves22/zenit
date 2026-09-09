import { PrismaClient } from '@prisma/client';
import SystemOperationsService from '../../src/services/system-operations.service';

const prisma = new PrismaClient();

describe('System operations tenant isolation', () => {
  const companyIds: number[] = [];
  const runIds: number[] = [];

  afterAll(async () => {
    if (runIds.length > 0) {
      await prisma.systemJobRun.deleteMany({ where: { id: { in: runIds } } });
    }

    if (companyIds.length > 0) {
      await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    }

    await prisma.$disconnect();
  });

  it('returns only company-scoped item errors and never returns a global stack', async () => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const [companyA, companyB] = await Promise.all([
      prisma.company.create({
        data: { name: `Operations Isolation A ${suffix}`, code: Number(`81${suffix.slice(-7)}`) }
      }),
      prisma.company.create({
        data: { name: `Operations Isolation B ${suffix}`, code: Number(`82${suffix.slice(-7)}`) }
      })
    ]);
    companyIds.push(companyA.id, companyB.id);

    const partialRun = await prisma.systemJobRun.create({
      data: {
        jobName: 'fixed-transaction-materializer',
        status: 'PARTIAL',
        startedAt: new Date('2099-01-01T00:00:00.000Z'),
        finishedAt: new Date('2099-01-01T00:00:01.000Z'),
        processedCount: 4,
        createdCount: 2,
        failedCount: 2,
        errorDetails: [
          { companyId: companyA.id, templateId: 101, error: 'falha exclusiva da empresa A' },
          { companyId: companyB.id, templateId: 202, error: 'falha exclusiva da empresa B' },
          { templateId: 303, error: 'falha global sem empresa' }
        ]
      }
    });
    const failedRun = await prisma.systemJobRun.create({
      data: {
        jobName: 'fixed-transaction-materializer',
        status: 'FAILED',
        startedAt: new Date('2099-01-01T00:01:00.000Z'),
        finishedAt: new Date('2099-01-01T00:01:01.000Z'),
        failedCount: 1,
        errorMessage: 'mensagem interna global',
        errorDetails: {
          stack: 'Error: segredo global\n    at materialize (job.ts:20:3)'
        }
      }
    });
    runIds.push(partialRun.id, failedRun.id);

    const [overviewA, overviewB] = await Promise.all([
      SystemOperationsService.getOverview(companyA.id),
      SystemOperationsService.getOverview(companyB.id)
    ]);
    const serializedA = JSON.stringify(overviewA);
    const serializedB = JSON.stringify(overviewB);
    const partialA = overviewA.jobs[0].recentRuns.find((run) => run.id === partialRun.id);
    const partialB = overviewB.jobs[0].recentRuns.find((run) => run.id === partialRun.id);
    const failedA = overviewA.jobs[0].recentRuns.find((run) => run.id === failedRun.id);

    expect(partialA).toMatchObject({
      failedCount: 2,
      companyErrorDetailCount: 1,
      countsScope: 'GLOBAL',
      errorDetailsScope: 'COMPANY',
      errorDetails: [
        { companyId: companyA.id, templateId: 101, error: 'falha exclusiva da empresa A' }
      ]
    });
    expect(partialB).toMatchObject({
      failedCount: 2,
      companyErrorDetailCount: 1,
      errorDetails: [
        { companyId: companyB.id, templateId: 202, error: 'falha exclusiva da empresa B' }
      ]
    });
    expect(failedA).toMatchObject({
      companyErrorDetailCount: 0,
      errorDetails: null,
      errorMessage: 'A execucao global falhou. Detalhes tecnicos globais nao sao exibidos neste painel.'
    });
    expect(serializedA).not.toContain('falha exclusiva da empresa B');
    expect(serializedA).not.toContain('falha global sem empresa');
    expect(serializedB).not.toContain('falha exclusiva da empresa A');
    expect(serializedB).not.toContain('falha global sem empresa');
    expect(serializedA).not.toContain('mensagem interna global');
    expect(serializedA).not.toContain('segredo global');
    expect(serializedB).not.toContain('mensagem interna global');
    expect(serializedB).not.toContain('segredo global');
  });
});
