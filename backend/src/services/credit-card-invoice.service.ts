import { PrismaClient, CreditCardInvoice, InvoiceStatus, Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';
import Decimal from 'decimal.js';
import CreditCardConfigService from './credit-card-config.service';

const prisma = new PrismaClient();

export default class CreditCardInvoiceService {
  /**
   * Gera uma nova fatura para um cartão
   */
  static async generateInvoice(
    financialAccountId: number,
    referenceMonth: number,
    referenceYear: number
  ): Promise<CreditCardInvoice> {
    // Validar que a conta existe e tem configuração
    const account = await prisma.financialAccount.findUnique({
      where: { id: financialAccountId }
    });

    if (!account) {
      throw new Error(`Conta ID ${financialAccountId} não encontrada`);
    }

    if (account.type !== 'CREDIT_CARD') {
      throw new Error('Apenas contas de cartão de crédito podem ter faturas');
    }

    const config = await CreditCardConfigService.getByAccountId(financialAccountId);
    if (!config) {
      throw new Error(`Configuração de cartão não encontrada para conta ID ${financialAccountId}`);
    }

    // Verificar se já existe fatura para este período
    const existing = await prisma.creditCardInvoice.findUnique({
      where: {
        financialAccountId_referenceYear_referenceMonth: {
          financialAccountId,
          referenceYear,
          referenceMonth
        }
      }
    });

    if (existing) {
      throw new Error(`Fatura já existe para ${referenceMonth}/${referenceYear}`);
    }

    // Calcular datas de fechamento e vencimento
    const closingDate = this.calculateClosingDate(referenceYear, referenceMonth, config.closingDay);
    const dueDate = CreditCardConfigService.calculateDueDate(closingDate, config.dueDaysAfterClosing);

    // Buscar saldo anterior não pago (fatura anterior)
    const previousInvoice = await this.getPreviousInvoice(financialAccountId, referenceMonth, referenceYear);
    const previousBalance = previousInvoice?.remainingAmount
      ? parseDecimal(previousInvoice.remainingAmount)
      : new Decimal(0);

    const invoice = await prisma.creditCardInvoice.create({
      data: {
        financialAccountId,
        companyId: account.companyId,
        referenceMonth,
        referenceYear,
        closingDate,
        dueDate,
        previousBalance: previousBalance.toNumber(),
        purchasesAmount: 0,
        paymentsAmount: 0,
        interestAmount: 0,
        feesAmount: 0,
        totalAmount: previousBalance.toNumber(),
        minimumPayment: 0,
        paidAmount: 0,
        remainingAmount: previousBalance.toNumber(),
        status: InvoiceStatus.OPEN
      }
    });

    // Atualizar configuração
    await prisma.creditCardConfig.update({
      where: { financialAccountId },
      data: { lastInvoiceGenerated: new Date() }
    });

    logger.info('Credit card invoice generated', {
      invoiceId: invoice.id,
      financialAccountId,
      referenceMonth,
      referenceYear,
      closingDate: closingDate.toISOString(),
      dueDate: dueDate.toISOString(),
      previousBalance: previousBalance.toNumber()
    });

    return invoice;
  }

  /**
   * Busca fatura atual (OPEN)
   */
  static async getCurrentInvoice(financialAccountId: number): Promise<CreditCardInvoice | null> {
    return prisma.creditCardInvoice.findFirst({
      where: {
        financialAccountId,
        status: InvoiceStatus.OPEN
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  /**
   * Busca fatura por período
   */
  static async getInvoiceByPeriod(
    financialAccountId: number,
    month: number,
    year: number
  ): Promise<CreditCardInvoice | null> {
    return prisma.creditCardInvoice.findUnique({
      where: {
        financialAccountId_referenceYear_referenceMonth: {
          financialAccountId,
          referenceYear: year,
          referenceMonth: month
        }
      }
    });
  }

  /**
   * Busca fatura por ID
   */
  static async getById(id: number): Promise<CreditCardInvoice | null> {
    return prisma.creditCardInvoice.findUnique({
      where: { id }
    });
  }

  /**
   * Lista faturas de um cartão
   */
  static async listInvoices(
    financialAccountId: number,
    params?: {
      status?: InvoiceStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<CreditCardInvoice[]> {
    const where: Prisma.CreditCardInvoiceWhereInput = {
      financialAccountId
    };

    if (params?.status) {
      where.status = params.status;
    }

    return prisma.creditCardInvoice.findMany({
      where,
      orderBy: [
        { referenceYear: 'desc' },
        { referenceMonth: 'desc' }
      ],
      take: params?.limit,
      skip: params?.offset
    });
  }

  /**
   * Adiciona transação à fatura
   */
  static async addTransactionToInvoice(
    invoiceId: number,
    transactionId: number,
    installmentId?: number
  ): Promise<void> {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    if (invoice.status !== InvoiceStatus.OPEN) {
      throw new Error(`Fatura ${invoice.referenceMonth}/${invoice.referenceYear} não está aberta`);
    }

    const transaction = await prisma.financialTransaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) {
      throw new Error(`Transação ID ${transactionId} não encontrada`);
    }

    // Verificar se transação já está vinculada
    const existing = await prisma.creditCardInvoiceTransaction.findUnique({
      where: {
        invoiceId_transactionId: {
          invoiceId,
          transactionId
        }
      }
    });

    if (existing) {
      logger.warn('Transaction already linked to invoice', { invoiceId, transactionId });
      return;
    }

    // Adicionar transação à fatura
    await prisma.creditCardInvoiceTransaction.create({
      data: {
        invoiceId,
        transactionId,
        installmentId,
        isInstallment: !!installmentId
      }
    });

    // Atualizar valor de compras na fatura
    const transactionAmount = parseDecimal(transaction.amount);
    await this.recalculateInvoice(invoiceId);

    logger.info('Transaction added to invoice', {
      invoiceId,
      transactionId,
      amount: transactionAmount.toNumber(),
      isInstallment: !!installmentId
    });
  }

  /**
   * Remove transação da fatura
   */
  static async removeTransactionFromInvoice(
    invoiceId: number,
    transactionId: number
  ): Promise<void> {
    await prisma.creditCardInvoiceTransaction.delete({
      where: {
        invoiceId_transactionId: {
          invoiceId,
          transactionId
        }
      }
    });

    await this.recalculateInvoice(invoiceId);

    logger.info('Transaction removed from invoice', { invoiceId, transactionId });
  }

  /**
   * Recalcula valores da fatura
   */
  static async recalculateInvoice(invoiceId: number): Promise<CreditCardInvoice> {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        transactions: {
          include: {
            transaction: true
          }
        },
        payments: true
      }
    });

    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    // Calcular total de compras (EXPENSE)
    const purchasesAmount = invoice.transactions
      .filter(it => it.transaction.type === 'EXPENSE')
      .reduce((sum, it) => sum.plus(parseDecimal(it.transaction.amount)), new Decimal(0));

    // Calcular total de pagamentos (INCOME)
    const paymentsAmount = invoice.transactions
      .filter(it => it.transaction.type === 'INCOME')
      .reduce((sum, it) => sum.plus(parseDecimal(it.transaction.amount)), new Decimal(0));

    // Calcular pagamentos da fatura
    const invoicePayments = invoice.payments.reduce(
      (sum, p) => sum.plus(parseDecimal(p.amount)),
      new Decimal(0)
    );

    const previousBalance = parseDecimal(invoice.previousBalance);
    const interestAmount = parseDecimal(invoice.interestAmount);
    const feesAmount = parseDecimal(invoice.feesAmount);

    const totalAmount = previousBalance
      .plus(purchasesAmount)
      .plus(interestAmount)
      .plus(feesAmount)
      .minus(paymentsAmount);

    const paidAmount = invoicePayments;
    const remainingAmount = totalAmount.minus(paidAmount);

    // Calcular pagamento mínimo
    const config = await CreditCardConfigService.getByAccountId(invoice.financialAccountId);
    const minimumPercent = config
      ? parseDecimal(config.minimumPaymentPercent).div(100)
      : new Decimal(0.1);
    const minimumPayment = totalAmount.times(minimumPercent);

    const updated = await prisma.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        purchasesAmount: purchasesAmount.toNumber(),
        paymentsAmount: paymentsAmount.toNumber(),
        totalAmount: totalAmount.toNumber(),
        minimumPayment: minimumPayment.toNumber(),
        paidAmount: paidAmount.toNumber(),
        remainingAmount: remainingAmount.toNumber(),
        isPaid: remainingAmount.lte(0)
      }
    });

    logger.info('Invoice recalculated', {
      invoiceId,
      purchases: purchasesAmount.toNumber(),
      payments: paymentsAmount.toNumber(),
      total: totalAmount.toNumber(),
      paid: paidAmount.toNumber(),
      remaining: remainingAmount.toNumber()
    });

    return updated;
  }

  /**
   * Aplica juros sobre saldo devedor
   */
  static async applyInterest(invoiceId: number): Promise<CreditCardInvoice> {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    const config = await CreditCardConfigService.getByAccountId(invoice.financialAccountId);
    if (!config || !config.interestRate) {
      logger.warn('No interest rate configured for card', { invoiceId });
      return invoice;
    }

    const previousBalance = parseDecimal(invoice.previousBalance);
    if (previousBalance.lte(0)) {
      logger.info('No previous balance to apply interest', { invoiceId });
      return invoice;
    }

    const interestRate = parseDecimal(config.interestRate).div(100);
    const interestAmount = previousBalance.times(interestRate);

    const updated = await prisma.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        interestAmount: interestAmount.toNumber()
      }
    });

    await this.recalculateInvoice(invoiceId);

    logger.info('Interest applied to invoice', {
      invoiceId,
      previousBalance: previousBalance.toNumber(),
      interestRate: config.interestRate,
      interestAmount: interestAmount.toNumber()
    });

    return updated;
  }

  /**
   * Aplica taxas (anuidade mensal)
   */
  static async applyFees(invoiceId: number): Promise<CreditCardInvoice> {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    const config = await CreditCardConfigService.getByAccountId(invoice.financialAccountId);
    if (!config || !config.annualFeeMonthlyCharge) {
      return invoice;
    }

    const monthlyFee = parseDecimal(config.annualFeeMonthlyCharge);

    const updated = await prisma.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        feesAmount: monthlyFee.toNumber()
      }
    });

    await this.recalculateInvoice(invoiceId);

    logger.info('Fees applied to invoice', {
      invoiceId,
      monthlyFee: monthlyFee.toNumber()
    });

    return updated;
  }

  /**
   * Fecha uma fatura
   */
  static async closeInvoice(invoiceId: number): Promise<CreditCardInvoice> {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    if (invoice.status !== InvoiceStatus.OPEN) {
      throw new Error(`Fatura já está no status ${invoice.status}`);
    }

    // Recalcular antes de fechar
    await this.recalculateInvoice(invoiceId);

    const updated = await prisma.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CLOSED,
        closedAt: new Date()
      }
    });

    logger.info('Invoice closed', {
      invoiceId,
      totalAmount: updated.totalAmount,
      minimumPayment: updated.minimumPayment
    });

    return updated;
  }

  /**
   * Marca fatura como vencida
   */
  static async markAsOverdue(invoiceId: number): Promise<CreditCardInvoice> {
    const invoice = await prisma.creditCardInvoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    if (invoice.isPaid) {
      logger.warn('Cannot mark paid invoice as overdue', { invoiceId });
      return invoice;
    }

    const updated = await prisma.creditCardInvoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.OVERDUE,
        isOverdue: true
      }
    });

    logger.info('Invoice marked as overdue', { invoiceId });

    return updated;
  }

  /**
   * Busca faturas vencidas
   */
  static async getOverdueInvoices(companyId?: number): Promise<CreditCardInvoice[]> {
    const where: Prisma.CreditCardInvoiceWhereInput = {
      dueDate: {
        lt: new Date()
      },
      isPaid: false,
      status: {
        in: [InvoiceStatus.CLOSED, InvoiceStatus.OPEN]
      }
    };

    if (companyId) {
      where.companyId = companyId;
    }

    return prisma.creditCardInvoice.findMany({
      where,
      include: {
        financialAccount: {
          select: {
            id: true,
            name: true,
            companyId: true
          }
        }
      }
    });
  }

  /**
   * Busca fatura anterior
   */
  private static async getPreviousInvoice(
    financialAccountId: number,
    currentMonth: number,
    currentYear: number
  ): Promise<CreditCardInvoice | null> {
    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;

    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear--;
    }

    return prisma.creditCardInvoice.findUnique({
      where: {
        financialAccountId_referenceYear_referenceMonth: {
          financialAccountId,
          referenceYear: prevYear,
          referenceMonth: prevMonth
        }
      }
    });
  }

  /**
   * Calcula data de fechamento para um mês/ano específico
   */
  private static calculateClosingDate(year: number, month: number, day: number): Date {
    const closingDate = new Date(year, month - 1, day);

    // Ajustar para último dia do mês se o dia não existir
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    if (day > lastDayOfMonth) {
      closingDate.setDate(lastDayOfMonth);
    }

    return closingDate;
  }

  /**
   * Busca transações de uma fatura
   */
  static async getInvoiceTransactions(invoiceId: number) {
    const invoiceTransactions = await prisma.creditCardInvoiceTransaction.findMany({
      where: { invoiceId },
      include: {
        transaction: {
          include: {
            category: true,
            fromAccount: true,
            toAccount: true
          }
        },
        installment: true
      },
      orderBy: {
        transaction: {
          date: 'asc'
        }
      }
    });

    return invoiceTransactions.map(it => ({
      ...it.transaction,
      isInstallment: it.isInstallment,
      installmentInfo: it.installment
    }));
  }
}
