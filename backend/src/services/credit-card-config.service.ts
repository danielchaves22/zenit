import { PrismaClient, CreditCardConfig, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

export default class CreditCardConfigService {
  /**
   * Cria configuração de cartão de crédito para uma conta
   */
  static async create(data: {
    financialAccountId: number;
    creditLimit: string | number;
    closingDay: number;
    dueDay?: number;
    dueDaysAfterClosing?: number;
    annualFee?: string | number;
    annualFeeMonthlyCharge?: string | number;
    interestRate?: string | number;
    latePaymentFee?: string | number;
    minimumPaymentPercent?: string | number;
    alertLimitPercent?: string | number;
    enableLimitAlerts?: boolean;
    enableDueAlerts?: boolean;
    dueDaysBeforeAlert?: number;
  }): Promise<CreditCardConfig> {
    const {
      financialAccountId,
      creditLimit,
      closingDay,
      dueDay,
      dueDaysAfterClosing = 10
    } = data;

    // Validar que a conta existe e é do tipo CREDIT_CARD
    const account = await prisma.financialAccount.findUnique({
      where: { id: financialAccountId }
    });

    if (!account) {
      throw new Error(`Conta financeira ID ${financialAccountId} não encontrada`);
    }

    if (account.type !== 'CREDIT_CARD') {
      throw new Error('Apenas contas do tipo CREDIT_CARD podem ter configuração de cartão');
    }

    // Verificar se já existe configuração
    const existing = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (existing) {
      throw new Error(`Conta ID ${financialAccountId} já possui configuração de cartão`);
    }

    // Validações
    if (closingDay < 1 || closingDay > 31) {
      throw new Error('Dia de fechamento deve estar entre 1 e 31');
    }

    const calculatedDueDay = dueDay || this.calculateDueDay(closingDay, dueDaysAfterClosing);
    if (calculatedDueDay < 1 || calculatedDueDay > 31) {
      throw new Error('Dia de vencimento deve estar entre 1 e 31');
    }

    const parsedCreditLimit = parseDecimal(creditLimit);
    if (parsedCreditLimit.lte(0)) {
      throw new Error('Limite de crédito deve ser maior que zero');
    }

    const config = await prisma.creditCardConfig.create({
      data: {
        financialAccountId,
        creditLimit: parsedCreditLimit.toNumber(),
        usedLimit: 0,
        availableLimit: parsedCreditLimit.toNumber(),
        closingDay,
        dueDay: calculatedDueDay,
        dueDaysAfterClosing,
        annualFee: data.annualFee ? parseDecimal(data.annualFee).toNumber() : null,
        annualFeeMonthlyCharge: data.annualFeeMonthlyCharge
          ? parseDecimal(data.annualFeeMonthlyCharge).toNumber()
          : null,
        interestRate: data.interestRate ? parseDecimal(data.interestRate).toNumber() : null,
        latePaymentFee: data.latePaymentFee ? parseDecimal(data.latePaymentFee).toNumber() : null,
        minimumPaymentPercent: data.minimumPaymentPercent
          ? parseDecimal(data.minimumPaymentPercent).toNumber()
          : 10,
        alertLimitPercent: data.alertLimitPercent
          ? parseDecimal(data.alertLimitPercent).toNumber()
          : 80,
        enableLimitAlerts: data.enableLimitAlerts ?? true,
        enableDueAlerts: data.enableDueAlerts ?? true,
        dueDaysBeforeAlert: data.dueDaysBeforeAlert ?? 3
      }
    });

    logger.info('Credit card config created', {
      configId: config.id,
      financialAccountId,
      creditLimit: parsedCreditLimit.toNumber(),
      closingDay,
      dueDay: calculatedDueDay
    });

    return config;
  }

  /**
   * Atualiza configuração de cartão de crédito
   */
  static async update(
    financialAccountId: number,
    data: Partial<{
      creditLimit: string | number;
      closingDay: number;
      dueDay: number;
      dueDaysAfterClosing: number;
      annualFee: string | number | null;
      annualFeeMonthlyCharge: string | number | null;
      interestRate: string | number | null;
      latePaymentFee: string | number | null;
      minimumPaymentPercent: string | number;
      alertLimitPercent: string | number;
      enableLimitAlerts: boolean;
      enableDueAlerts: boolean;
      dueDaysBeforeAlert: number;
      isActive: boolean;
    }>
  ): Promise<CreditCardConfig> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    const updateData: any = {};

    // Atualizar limite de crédito
    if (data.creditLimit !== undefined) {
      const parsedCreditLimit = parseDecimal(data.creditLimit);
      if (parsedCreditLimit.lte(0)) {
        throw new Error('Limite de crédito deve ser maior que zero');
      }

      const currentUsed = parseDecimal(config.usedLimit);
      const newAvailable = parsedCreditLimit.minus(currentUsed);

      updateData.creditLimit = parsedCreditLimit.toNumber();
      updateData.availableLimit = newAvailable.toNumber();

      logger.info('Credit limit updated', {
        financialAccountId,
        previousLimit: config.creditLimit,
        newLimit: parsedCreditLimit.toNumber(),
        usedLimit: currentUsed.toNumber(),
        newAvailable: newAvailable.toNumber()
      });
    }

    // Validar dias de fechamento e vencimento
    if (data.closingDay !== undefined) {
      if (data.closingDay < 1 || data.closingDay > 31) {
        throw new Error('Dia de fechamento deve estar entre 1 e 31');
      }
      updateData.closingDay = data.closingDay;
    }

    if (data.dueDay !== undefined) {
      if (data.dueDay < 1 || data.dueDay > 31) {
        throw new Error('Dia de vencimento deve estar entre 1 e 31');
      }
      updateData.dueDay = data.dueDay;
    }

    // Atualizar outros campos numéricos
    if (data.dueDaysAfterClosing !== undefined) updateData.dueDaysAfterClosing = data.dueDaysAfterClosing;
    if (data.annualFee !== undefined) {
      updateData.annualFee = data.annualFee === null ? null : parseDecimal(data.annualFee).toNumber();
    }
    if (data.annualFeeMonthlyCharge !== undefined) {
      updateData.annualFeeMonthlyCharge = data.annualFeeMonthlyCharge === null
        ? null
        : parseDecimal(data.annualFeeMonthlyCharge).toNumber();
    }
    if (data.interestRate !== undefined) {
      updateData.interestRate = data.interestRate === null ? null : parseDecimal(data.interestRate).toNumber();
    }
    if (data.latePaymentFee !== undefined) {
      updateData.latePaymentFee = data.latePaymentFee === null
        ? null
        : parseDecimal(data.latePaymentFee).toNumber();
    }
    if (data.minimumPaymentPercent !== undefined) {
      updateData.minimumPaymentPercent = parseDecimal(data.minimumPaymentPercent).toNumber();
    }
    if (data.alertLimitPercent !== undefined) {
      updateData.alertLimitPercent = parseDecimal(data.alertLimitPercent).toNumber();
    }

    // Atualizar campos boolean
    if (data.enableLimitAlerts !== undefined) updateData.enableLimitAlerts = data.enableLimitAlerts;
    if (data.enableDueAlerts !== undefined) updateData.enableDueAlerts = data.enableDueAlerts;
    if (data.dueDaysBeforeAlert !== undefined) updateData.dueDaysBeforeAlert = data.dueDaysBeforeAlert;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const updated = await prisma.creditCardConfig.update({
      where: { financialAccountId },
      data: updateData
    });

    logger.info('Credit card config updated', {
      financialAccountId,
      updatedFields: Object.keys(updateData)
    });

    return updated;
  }

  /**
   * Busca configuração por ID da conta
   */
  static async getByAccountId(financialAccountId: number): Promise<CreditCardConfig | null> {
    return prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });
  }

  /**
   * Deleta configuração de cartão
   */
  static async delete(financialAccountId: number): Promise<void> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    await prisma.creditCardConfig.delete({
      where: { financialAccountId }
    });

    logger.info('Credit card config deleted', { financialAccountId });
  }

  /**
   * Atualiza limite usado
   */
  static async updateUsedLimit(
    financialAccountId: number,
    amount: number | string,
    operation: 'add' | 'subtract' = 'add'
  ): Promise<CreditCardConfig> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    const currentUsed = parseDecimal(config.usedLimit);
    const changeAmount = parseDecimal(amount);
    const creditLimit = parseDecimal(config.creditLimit);

    let newUsed: Decimal;
    if (operation === 'add') {
      newUsed = currentUsed.plus(changeAmount);
    } else {
      newUsed = currentUsed.minus(changeAmount);
    }

    // Garantir que não fique negativo
    if (newUsed.lt(0)) {
      newUsed = new Decimal(0);
    }

    const newAvailable = creditLimit.minus(newUsed);

    const updated = await prisma.creditCardConfig.update({
      where: { financialAccountId },
      data: {
        usedLimit: newUsed.toNumber(),
        availableLimit: newAvailable.toNumber()
      }
    });

    logger.info('Credit card used limit updated', {
      financialAccountId,
      operation,
      amount: changeAmount.toNumber(),
      previousUsed: currentUsed.toNumber(),
      newUsed: newUsed.toNumber(),
      newAvailable: newAvailable.toNumber()
    });

    return updated;
  }

  /**
   * Verifica se há limite disponível
   */
  static async checkLimitAvailable(
    financialAccountId: number,
    amount: number | string
  ): Promise<boolean> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    const available = parseDecimal(config.availableLimit);
    const required = parseDecimal(amount);

    return available.gte(required);
  }

  /**
   * Obtém limite disponível
   */
  static async getAvailableLimit(financialAccountId: number): Promise<number> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId },
      select: { availableLimit: true }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    return parseDecimal(config.availableLimit).toNumber();
  }

  /**
   * Verifica se deve disparar alerta de limite
   */
  static async checkLimitAlert(financialAccountId: number): Promise<{
    shouldAlert: boolean;
    percentage: number;
    usedAmount: number;
    availableAmount: number;
    limitAmount: number;
  }> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    const creditLimit = parseDecimal(config.creditLimit);
    const usedLimit = parseDecimal(config.usedLimit);
    const availableLimit = parseDecimal(config.availableLimit);
    const alertPercent = parseDecimal(config.alertLimitPercent);

    const usedPercentage = creditLimit.eq(0)
      ? new Decimal(0)
      : usedLimit.div(creditLimit).times(100);

    const shouldAlert = config.enableLimitAlerts && usedPercentage.gte(alertPercent);

    return {
      shouldAlert,
      percentage: parseFloat(usedPercentage.toFixed(2)),
      usedAmount: usedLimit.toNumber(),
      availableAmount: availableLimit.toNumber(),
      limitAmount: creditLimit.toNumber()
    };
  }

  /**
   * Calcula próxima data de fechamento
   */
  static async getNextClosingDate(financialAccountId: number): Promise<Date> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    return this.calculateNextDate(config.closingDay);
  }

  /**
   * Calcula próxima data de vencimento
   */
  static async getNextDueDate(financialAccountId: number): Promise<Date> {
    const config = await prisma.creditCardConfig.findUnique({
      where: { financialAccountId }
    });

    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    return this.calculateNextDate(config.dueDay);
  }

  /**
   * Calcula data de vencimento baseada no fechamento
   */
  static calculateDueDate(closingDate: Date, dueDays: number): Date {
    const dueDate = new Date(closingDate);
    dueDate.setDate(dueDate.getDate() + dueDays);
    return dueDate;
  }

  /**
   * Helper: Calcula dia de vencimento baseado no fechamento
   */
  private static calculateDueDay(closingDay: number, dueDaysAfter: number): number {
    let dueDay = closingDay + dueDaysAfter;
    if (dueDay > 31) {
      dueDay = dueDay - 31;
    }
    return dueDay;
  }

  /**
   * Helper: Calcula próxima ocorrência de um dia do mês
   */
  private static calculateNextDate(dayOfMonth: number): Date {
    const now = new Date();
    const currentDay = now.getDate();

    let targetDate = new Date(now);
    targetDate.setDate(dayOfMonth);

    // Se o dia já passou neste mês, pegar no próximo mês
    if (currentDay >= dayOfMonth) {
      targetDate.setMonth(targetDate.getMonth() + 1);
    }

    // Ajustar para último dia do mês se o dia não existir
    const lastDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
    if (dayOfMonth > lastDayOfMonth) {
      targetDate.setDate(lastDayOfMonth);
    }

    return targetDate;
  }

  /**
   * Lista todos os cartões ativos de uma empresa
   */
  static async listByCompany(companyId: number, includeInactive = false): Promise<Array<CreditCardConfig & { financialAccount: any }>> {
    const whereClause: any = {
      financialAccount: {
        companyId,
        type: 'CREDIT_CARD'
      }
    };

    if (!includeInactive) {
      whereClause.isActive = true;
    }

    return prisma.creditCardConfig.findMany({
      where: whereClause,
      include: {
        financialAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            balance: true,
            isActive: true,
            companyId: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }
}
