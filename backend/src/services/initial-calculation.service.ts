import {
  CalculationRuleSet,
  CalculationVerbaTemplate,
  FgtsRegime,
  Prisma,
  PrismaClient,
  Process,
  ProcessCustomVerba
} from '@prisma/client';

import {
  DEFAULT_INITIAL_CALCULATION_RULE_SET_CODE,
  DEFAULT_INITIAL_CALCULATION_RULE_SET_NAME,
  DEFAULT_INITIAL_CALCULATION_VERBA_TEMPLATES
} from '../constants/initial-calculation-catalog';
import {
  calculateInitialCalculation,
  CalculationVerbaSeed,
  InitialCalculationInputs
} from './initial-calculation.engine';

const prisma = new PrismaClient();

function toInputJson(
  value?: Record<string, unknown> | null
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

function normalizeCustomVerbaCode(label: string, suggestedCode?: string | null): string {
  const source = (suggestedCode && suggestedCode.trim().length ? suggestedCode : label).trim();
  const base = source
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

  return `PROCESS_${base || 'VERBA'}`;
}

const fullVersionInclude = {
  ruleSet: true,
  verbas: {
    orderBy: {
      sortOrder: 'asc' as const
    },
    include: {
      linhasResultado: {
        orderBy: {
          sortOrder: 'asc' as const
        }
      }
    }
  }
};

export default class InitialCalculationService {
  static async getInitialCalculation(processId: number, companyId: number): Promise<any> {
    await this.syncDefaultCatalog();

    const process = await this.ensureProcess(processId, companyId);
    const [catalog, initialCalculation] = await Promise.all([
      this.getCatalog(processId, companyId),
      prisma.initialCalculation.findUnique({
        where: { processId },
        include: {
          currentPublishedVersion: {
            include: fullVersionInclude
          },
          versions: {
            select: {
              id: true,
              versionNumber: true,
              fgtsRegime: true,
              createdAt: true,
              publishedAt: true,
              summarySnapshotJson: true
            },
            orderBy: {
              versionNumber: 'desc'
            }
          }
        }
      })
    ]);

    const latestVersion = initialCalculation
      ? await prisma.initialCalculationVersion.findFirst({
          where: {
            initialCalculationId: initialCalculation.id
          },
          orderBy: {
            versionNumber: 'desc'
          },
          include: fullVersionInclude
        })
      : null;

    return {
      process: {
        id: process.id,
        status: process.status,
        originType: process.originType,
        requestingLawyerName: process.requestingLawyerName,
        claimantName: process.claimantName,
        notes: process.notes
      },
      calculation: initialCalculation
        ? {
            ...initialCalculation,
            latestVersion
          }
        : null,
      catalog
    };
  }

  static async getCatalog(processId: number, companyId: number): Promise<any> {
    await this.syncDefaultCatalog();
    await this.ensureProcess(processId, companyId);

    const [ruleSet, verbasPadrao, verbasDoProcesso] = await Promise.all([
      prisma.calculationRuleSet.findUnique({
        where: {
          code: DEFAULT_INITIAL_CALCULATION_RULE_SET_CODE
        }
      }),
      prisma.calculationVerbaTemplate.findMany({
        where: {
          isActive: true,
          OR: [{ scope: 'SYSTEM' }, { scope: 'COMPANY', companyId }]
        },
        orderBy: [{ groupCode: 'asc' }, { sortOrder: 'asc' }]
      }),
      prisma.processCustomVerba.findMany({
        where: {
          processId,
          companyId,
          isActive: true
        },
        orderBy: [{ groupCode: 'asc' }, { sortOrder: 'asc' }]
      })
    ]);

    return {
      ruleSet,
      verbasPadrao,
      verbasDoProcesso
    };
  }

  static async listProcessCustomVerbas(processId: number, companyId: number): Promise<ProcessCustomVerba[]> {
    await this.ensureProcess(processId, companyId);

    return prisma.processCustomVerba.findMany({
      where: {
        processId,
        companyId,
        isActive: true
      },
      orderBy: [{ groupCode: 'asc' }, { sortOrder: 'asc' }]
    });
  }

  static async createProcessCustomVerba(params: {
    processId: number;
    companyId: number;
    createdBy: number;
    code?: string | null;
    label: string;
    groupCode: string;
    groupLabel: string;
    strategy: any;
    fgtsMode: any;
    configJson?: Record<string, unknown> | null;
    inputSchemaJson?: Record<string, unknown> | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ProcessCustomVerba> {
    await this.ensureProcess(params.processId, params.companyId);

    return prisma.$transaction(async (tx) => {
      const code = await this.generateUniqueCustomVerbaCode(
        tx,
        params.processId,
        normalizeCustomVerbaCode(params.label, params.code)
      );

      return tx.processCustomVerba.create({
        data: {
          processId: params.processId,
          companyId: params.companyId,
          code,
          label: params.label.trim(),
          groupCode: params.groupCode.trim(),
          groupLabel: params.groupLabel.trim(),
          strategy: params.strategy,
          fgtsMode: params.fgtsMode,
          configJson: toInputJson(params.configJson),
          inputSchemaJson: toInputJson(params.inputSchemaJson),
          sortOrder: params.sortOrder ?? 0,
          isActive: params.isActive ?? true,
          createdBy: params.createdBy,
          updatedBy: params.createdBy
        }
      });
    });
  }

  static async updateProcessCustomVerba(params: {
    processId: number;
    companyId: number;
    verbaId: number;
    updatedBy: number;
    code?: string | null;
    label?: string;
    groupCode?: string;
    groupLabel?: string;
    strategy?: any;
    fgtsMode?: any;
    configJson?: Record<string, unknown> | null;
    inputSchemaJson?: Record<string, unknown> | null;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<ProcessCustomVerba> {
    const verba = await this.ensureProcessCustomVerba(params.verbaId, params.processId, params.companyId);

    return prisma.$transaction(async (tx) => {
      let code: string | undefined;

      if (params.label !== undefined || params.code !== undefined) {
        code = await this.generateUniqueCustomVerbaCode(
          tx,
          params.processId,
          normalizeCustomVerbaCode(params.label ?? verba.label, params.code ?? verba.code),
          verba.id
        );
      }

      return tx.processCustomVerba.update({
        where: { id: verba.id },
        data: {
          ...(code !== undefined && { code }),
          ...(params.label !== undefined && { label: params.label.trim() }),
          ...(params.groupCode !== undefined && { groupCode: params.groupCode.trim() }),
          ...(params.groupLabel !== undefined && { groupLabel: params.groupLabel.trim() }),
          ...(params.strategy !== undefined && { strategy: params.strategy }),
          ...(params.fgtsMode !== undefined && { fgtsMode: params.fgtsMode }),
          ...(params.configJson !== undefined && { configJson: toInputJson(params.configJson) }),
          ...(params.inputSchemaJson !== undefined && { inputSchemaJson: toInputJson(params.inputSchemaJson) }),
          ...(params.sortOrder !== undefined && { sortOrder: params.sortOrder }),
          ...(params.isActive !== undefined && { isActive: params.isActive }),
          updatedBy: params.updatedBy
        }
      });
    });
  }

  static async deleteProcessCustomVerba(processId: number, companyId: number, verbaId: number): Promise<void> {
    const verba = await this.ensureProcessCustomVerba(verbaId, processId, companyId);

    await prisma.processCustomVerba.delete({
      where: { id: verba.id }
    });
  }

  static async createInitialCalculationVersion(params: {
    processId: number;
    companyId: number;
    createdBy: number;
    fgtsRegime: FgtsRegime;
    inputs: InitialCalculationInputs;
    publish?: boolean;
    disabledVerbaCodes?: string[];
    calculationId?: number;
  }): Promise<any> {
    return prisma.$transaction(async (tx) => {
      const process = await this.ensureProcess(params.processId, params.companyId, tx);
      await this.syncTemplates(tx);

      const [ruleSet, verbasPadrao, verbasDoProcesso] = await Promise.all([
        this.ensureRuleSet(tx),
        tx.calculationVerbaTemplate.findMany({
          where: {
            isActive: true,
            OR: [{ scope: 'SYSTEM' }, { scope: 'COMPANY', companyId: params.companyId }]
          },
          orderBy: [{ groupCode: 'asc' }, { sortOrder: 'asc' }]
        }),
        tx.processCustomVerba.findMany({
          where: {
            processId: params.processId,
            companyId: params.companyId,
            isActive: true
          },
          orderBy: [{ groupCode: 'asc' }, { sortOrder: 'asc' }]
        })
      ]);

      const calculation = params.calculationId
        ? await this.ensureInitialCalculation(params.calculationId, params.processId, params.companyId, tx)
        : await tx.initialCalculation.upsert({
            where: { processId: params.processId },
            update: {
              updatedBy: params.createdBy
            },
            create: {
              processId: params.processId,
              companyId: params.companyId,
              status: 'DRAFT',
              createdBy: params.createdBy,
              updatedBy: params.createdBy
            }
          });

      const lastVersion = await tx.initialCalculationVersion.findFirst({
        where: {
          initialCalculationId: calculation.id
        },
        orderBy: {
          versionNumber: 'desc'
        },
        select: {
          versionNumber: true
        }
      });

      const versionNumber = (lastVersion?.versionNumber ?? 0) + 1;
      const seedVerbas = this.buildCalculationVerbaSeeds(
        verbasPadrao,
        verbasDoProcesso,
        new Set(params.disabledVerbaCodes ?? [])
      );
      const engineResult = calculateInitialCalculation({
        fgtsRegime: params.fgtsRegime,
        inputs: params.inputs,
        verbas: seedVerbas
      });

      const createdVersion = await tx.initialCalculationVersion.create({
        data: {
          initialCalculationId: calculation.id,
          versionNumber,
          ruleSetId: ruleSet.id,
          fgtsRegime: params.fgtsRegime,
          inputSnapshotJson: engineResult.inputSnapshot as Prisma.InputJsonValue,
          summarySnapshotJson: engineResult.summary as unknown as Prisma.InputJsonValue,
          createdBy: params.createdBy,
          verbas: {
            create: engineResult.verbas.map((verba) => ({
              sourceType: verba.sourceType,
              templateId: verba.templateId ?? undefined,
              processCustomVerbaId: verba.processCustomVerbaId ?? undefined,
              verbaCode: verba.verbaCode,
              verbaLabel: verba.verbaLabel,
              groupCode: verba.groupCode,
              groupLabel: verba.groupLabel,
              strategy: verba.strategy,
              fgtsMode: verba.fgtsMode,
              configJson: toInputJson(verba.configJson),
              inputSchemaJson: toInputJson(verba.inputSchemaJson),
              isEnabled: verba.isEnabled,
              sortOrder: verba.sortOrder,
              linhasResultado: {
                create: verba.lines.map((line) => ({
                  lineType: line.lineType,
                  label: line.label,
                  amount: line.amount,
                  sortOrder: line.sortOrder,
                  memoryJson: toInputJson(line.memoryJson ?? null)
                }))
              }
            }))
          }
        },
        include: fullVersionInclude
      });

      if (params.publish) {
        await this.publishVersionTx({
          tx,
          process,
          calculationId: calculation.id,
          versionId: createdVersion.id,
          changedBy: params.createdBy
        });
      } else {
        await tx.initialCalculation.update({
          where: { id: calculation.id },
          data: {
            status: 'DRAFT',
            updatedBy: params.createdBy
          }
        });
      }

      return tx.initialCalculation.findUnique({
        where: {
          id: calculation.id
        },
        include: {
          currentPublishedVersion: {
            include: fullVersionInclude
          },
          versions: {
            select: {
              id: true,
              versionNumber: true,
              fgtsRegime: true,
              createdAt: true,
              publishedAt: true,
              summarySnapshotJson: true
            },
            orderBy: {
              versionNumber: 'desc'
            }
          }
        }
      });
    });
  }

  static async listInitialCalculationVersions(processId: number, companyId: number, calculationId: number): Promise<any[]> {
    await this.ensureInitialCalculation(calculationId, processId, companyId);

    return prisma.initialCalculationVersion.findMany({
      where: {
        initialCalculationId: calculationId
      },
      orderBy: {
        versionNumber: 'desc'
      },
      include: fullVersionInclude
    });
  }

  static async publishInitialCalculationVersion(params: {
    processId: number;
    companyId: number;
    calculationId: number;
    versionId: number;
    changedBy: number;
  }): Promise<any> {
    return prisma.$transaction(async (tx) => {
      const process = await this.ensureProcess(params.processId, params.companyId, tx);
      await this.ensureInitialCalculation(params.calculationId, params.processId, params.companyId, tx);

      const version = await tx.initialCalculationVersion.findFirst({
        where: {
          id: params.versionId,
          initialCalculationId: params.calculationId
        },
        select: {
          id: true
        }
      });

      if (!version) {
        throw new Error('Versao do calculo inicial nao encontrada.');
      }

      await this.publishVersionTx({
        tx,
        process,
        calculationId: params.calculationId,
        versionId: params.versionId,
        changedBy: params.changedBy
      });

      return tx.initialCalculation.findUnique({
        where: {
          id: params.calculationId
        },
        include: {
          currentPublishedVersion: {
            include: fullVersionInclude
          },
          versions: {
            select: {
              id: true,
              versionNumber: true,
              fgtsRegime: true,
              createdAt: true,
              publishedAt: true,
              summarySnapshotJson: true
            },
            orderBy: {
              versionNumber: 'desc'
            }
          }
        }
      });
    });
  }

  static async syncDefaultCatalog(): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await this.ensureRuleSet(tx);
      await this.syncTemplates(tx);
    });
  }

  private static buildCalculationVerbaSeeds(
    verbasPadrao: CalculationVerbaTemplate[],
    verbasDoProcesso: ProcessCustomVerba[],
    disabledCodes: Set<string>
  ): CalculationVerbaSeed[] {
    const templateSeeds: CalculationVerbaSeed[] = verbasPadrao.map((verba) => ({
      sourceType: 'TEMPLATE',
      templateId: verba.id,
      processCustomVerbaId: null,
      verbaCode: verba.code,
      verbaLabel: verba.label,
      groupCode: verba.groupCode,
      groupLabel: verba.groupLabel,
      strategy: verba.strategy,
      fgtsMode: verba.fgtsMode,
      configJson: verba.configJson as Record<string, unknown> | null,
      inputSchemaJson: verba.inputSchemaJson as Record<string, unknown> | null,
      isEnabled: !disabledCodes.has(verba.code),
      sortOrder: verba.sortOrder
    }));

    const customSeeds: CalculationVerbaSeed[] = verbasDoProcesso.map((verba) => ({
      sourceType: 'PROCESS_CUSTOM',
      templateId: null,
      processCustomVerbaId: verba.id,
      verbaCode: verba.code,
      verbaLabel: verba.label,
      groupCode: verba.groupCode,
      groupLabel: verba.groupLabel,
      strategy: verba.strategy,
      fgtsMode: verba.fgtsMode,
      configJson: verba.configJson as Record<string, unknown> | null,
      inputSchemaJson: verba.inputSchemaJson as Record<string, unknown> | null,
      isEnabled: !disabledCodes.has(verba.code),
      sortOrder: verba.sortOrder
    }));

    return [...templateSeeds, ...customSeeds].sort((left, right) => left.sortOrder - right.sortOrder);
  }

  private static async ensureRuleSet(tx: Prisma.TransactionClient): Promise<CalculationRuleSet> {
    return tx.calculationRuleSet.upsert({
      where: {
        code: DEFAULT_INITIAL_CALCULATION_RULE_SET_CODE
      },
      update: {
        name: DEFAULT_INITIAL_CALCULATION_RULE_SET_NAME,
        isActive: true
      },
      create: {
        code: DEFAULT_INITIAL_CALCULATION_RULE_SET_CODE,
        name: DEFAULT_INITIAL_CALCULATION_RULE_SET_NAME,
        isActive: true
      }
    });
  }

  private static async syncTemplates(tx: Prisma.TransactionClient): Promise<void> {
    for (const template of DEFAULT_INITIAL_CALCULATION_VERBA_TEMPLATES) {
      await tx.calculationVerbaTemplate.upsert({
        where: {
          code: template.code
        },
        update: {
          scope: template.scope,
          label: template.label,
          groupCode: template.groupCode,
          groupLabel: template.groupLabel,
          strategy: template.strategy,
          fgtsMode: template.fgtsMode,
          configJson: toInputJson(template.configJson),
          inputSchemaJson: toInputJson(template.inputSchemaJson),
          sortOrder: template.sortOrder,
          isActive: true
        },
        create: {
          scope: template.scope,
          code: template.code,
          label: template.label,
          groupCode: template.groupCode,
          groupLabel: template.groupLabel,
          strategy: template.strategy,
          fgtsMode: template.fgtsMode,
          configJson: toInputJson(template.configJson),
          inputSchemaJson: toInputJson(template.inputSchemaJson),
          sortOrder: template.sortOrder,
          isActive: true
        }
      });
    }
  }

  private static async publishVersionTx(params: {
    tx: Prisma.TransactionClient;
    process: Process;
    calculationId: number;
    versionId: number;
    changedBy: number;
  }): Promise<void> {
    const publishedAt = new Date();

    await params.tx.initialCalculationVersion.update({
      where: {
        id: params.versionId
      },
      data: {
        publishedAt
      }
    });

    await params.tx.initialCalculation.update({
      where: {
        id: params.calculationId
      },
      data: {
        status: 'PUBLISHED',
        currentPublishedVersionId: params.versionId,
        updatedBy: params.changedBy
      }
    });

    if (params.process.status === 'SOLICITACAO') {
      await params.tx.process.update({
        where: {
          id: params.process.id
        },
        data: {
          status: 'INICIAL',
          updatedBy: params.changedBy
        }
      });

      await params.tx.processStatusHistory.create({
        data: {
          processId: params.process.id,
          fromStatus: params.process.status,
          toStatus: 'INICIAL',
          changedBy: params.changedBy,
          reason: 'Publicacao do calculo inicial'
        }
      });
    }
  }

  private static async ensureProcess(
    processId: number,
    companyId: number,
    tx: Prisma.TransactionClient | PrismaClient = prisma
  ): Promise<Process> {
    const process = await tx.process.findFirst({
      where: {
        id: processId,
        companyId,
        deletedAt: null
      }
    });

    if (!process) {
      throw new Error('Processo nao encontrado.');
    }

    return process;
  }

  private static async ensureInitialCalculation(
    calculationId: number,
    processId: number,
    companyId: number,
    tx: Prisma.TransactionClient | PrismaClient = prisma
  ): Promise<any> {
    const calculation = await tx.initialCalculation.findFirst({
      where: {
        id: calculationId,
        processId,
        companyId
      }
    });

    if (!calculation) {
      throw new Error('Calculo inicial nao encontrado para o processo.');
    }

    return calculation;
  }

  private static async ensureProcessCustomVerba(
    verbaId: number,
    processId: number,
    companyId: number
  ): Promise<ProcessCustomVerba> {
    const verba = await prisma.processCustomVerba.findFirst({
      where: {
        id: verbaId,
        processId,
        companyId
      }
    });

    if (!verba) {
      throw new Error('Verba do processo nao encontrada.');
    }

    return verba;
  }

  private static async generateUniqueCustomVerbaCode(
    tx: Prisma.TransactionClient,
    processId: number,
    baseCode: string,
    excludeId?: number
  ): Promise<string> {
    let code = baseCode;
    let suffix = 1;

    while (true) {
      const existing = await tx.processCustomVerba.findFirst({
        where: {
          processId,
          code,
          ...(excludeId ? { id: { not: excludeId } } : {})
        },
        select: {
          id: true
        }
      });

      if (!existing) {
        return code;
      }

      suffix += 1;
      code = `${baseCode}_${suffix}`;
    }
  }
}
