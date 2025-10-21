import { PrismaClient, CreditCardInvoicePayment, PaymentType, InvoiceStatus } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';
import Decimal from 'decimal.js';
import FinancialTransactionService from './financial-transaction.service';
import CreditCardInvoiceService from './credit-card-invoice.service';
import CreditCardConfigService from './credit-card-config.service';

const prisma = new PrismaClient();

export default class CreditCardPaymentService {
  /**
   * Paga fatura completamente
   */
  static async payInvoiceFull(
    invoiceId: number,
    paymentData: {
      fromAccountId: number;
      paymentDate: Date;
      userId: number;
      notes?: string;
    }
  ): Promise<CreditCardInvoicePayment> {
    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    const totalAmount = parseDecimal(invoice.totalAmount);

    return this.processPayment(
      invoiceId,
      totalAmount.toNumber(),
      PaymentType.FULL_PAYMENT,
      paymentData
    );
  }

  /**
   * Paga valor mínimo da fatura
   */
  static async payInvoiceMinimum(
    invoiceId: number,
    paymentData: {
      fromAccountId: number;
      paymentDate: Date;
      userId: number;
      notes?: string;
    }
  ): Promise<CreditCardInvoicePayment> {
    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    const minimumPayment = parseDecimal(invoice.minimumPayment);

    return this.processPayment(
      invoiceId,
      minimumPayment.toNumber(),
      PaymentType.MINIMUM_PAYMENT,
      paymentData
    );
  }

  /**
   * Paga valor parcial da fatura
   */
  static async payInvoicePartial(
    invoiceId: number,
    amount: number | string,
    paymentData: {
      fromAccountId: number;
      paymentDate: Date;
      userId: number;
      notes?: string;
    }
  ): Promise<CreditCardInvoicePayment> {
    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    const paymentAmount = parseDecimal(amount);
    const minimumPayment = parseDecimal(invoice.minimumPayment);
    const totalAmount = parseDecimal(invoice.totalAmount);

    if (paymentAmount.lt(minimumPayment)) {
      throw new Error(
        `Valor de pagamento (${paymentAmount.toFixed(2)}) menor que o mínimo (${minimumPayment.toFixed(2)})`
      );
    }

    if (paymentAmount.gt(totalAmount)) {
      throw new Error(
        `Valor de pagamento (${paymentAmount.toFixed(2)}) maior que o total (${totalAmount.toFixed(2)})`
      );
    }

    return this.processPayment(
      invoiceId,
      paymentAmount.toNumber(),
      PaymentType.PARTIAL_PAYMENT,
      paymentData
    );
  }

  /**
   * Processa um pagamento de fatura
   */
  private static async processPayment(
    invoiceId: number,
    amount: number,
    paymentType: PaymentType,
    paymentData: {
      fromAccountId: number;
      paymentDate: Date;
      userId: number;
      notes?: string;
    }
  ): Promise<CreditCardInvoicePayment> {
    const { fromAccountId, paymentDate, userId, notes } = paymentData;

    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice) {
      throw new Error(`Fatura ID ${invoiceId} não encontrada`);
    }

    if (invoice.isPaid) {
      throw new Error('Fatura já foi paga completamente');
    }

    // Verificar se pode pagar
    const canPay = await this.canPayInvoice(invoiceId);
    if (!canPay.canPay) {
      throw new Error(canPay.reason || 'Não é possível pagar esta fatura');
    }

    const parsedAmount = parseDecimal(amount);

    // Criar transação de transferência (da conta de origem para o cartão)
    const transactionResult = await FinancialTransactionService.createTransaction({
      description: `Pagamento Fatura ${invoice.referenceMonth}/${invoice.referenceYear}`,
      amount: parsedAmount.toNumber(),
      date: paymentDate,
      effectiveDate: paymentDate,
      type: 'TRANSFER',
      status: 'COMPLETED',
      fromAccountId,
      toAccountId: invoice.financialAccountId,
      companyId: invoice.companyId,
      createdBy: userId,
      notes: notes || `Pagamento ${paymentType.toLowerCase().replace('_', ' ')}`
    });

    const transaction = Array.isArray(transactionResult) ? transactionResult[0] : transactionResult;

    // Criar registro de pagamento
    const payment = await prisma.creditCardInvoicePayment.create({
      data: {
        invoiceId,
        transactionId: transaction.id,
        amount: parsedAmount.toNumber(),
        paymentType,
        paymentDate,
        notes,
        createdBy: userId
      }
    });

    // Recalcular fatura
    await CreditCardInvoiceService.recalculateInvoice(invoiceId);

    // Atualizar status da fatura
    const updatedInvoice = await CreditCardInvoiceService.getById(invoiceId);
    if (updatedInvoice) {
      const remaining = parseDecimal(updatedInvoice.remainingAmount);

      if (remaining.lte(0)) {
        // Pago completamente
        await prisma.creditCardInvoice.update({
          where: { id: invoiceId },
          data: {
            status: InvoiceStatus.PAID,
            isPaid: true,
            paidAt: new Date()
          }
        });

        // Liberar todo o limite usado
        await CreditCardConfigService.updateUsedLimit(
          invoice.financialAccountId,
          parsedAmount.toNumber(),
          'subtract'
        );
      } else {
        // Pago parcialmente
        await prisma.creditCardInvoice.update({
          where: { id: invoiceId },
          data: {
            status: InvoiceStatus.PARTIALLY_PAID
          }
        });

        // Liberar limite proporcional ao pagamento
        await CreditCardConfigService.updateUsedLimit(
          invoice.financialAccountId,
          parsedAmount.toNumber(),
          'subtract'
        );
      }

      // Marcar parcelas como pagas se aplicável
      await this.markInstallmentsAsPaid(invoiceId);
    }

    logger.info('Invoice payment processed', {
      invoiceId,
      paymentId: payment.id,
      amount: parsedAmount.toNumber(),
      paymentType,
      transactionId: transaction.id
    });

    return payment;
  }

  /**
   * Marca parcelas de parcelamentos como pagas
   */
  private static async markInstallmentsAsPaid(invoiceId: number): Promise<void> {
    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice || !invoice.isPaid) {
      return;
    }

    // Marcar todas as parcelas desta fatura como pagas
    await prisma.creditCardInstallmentPayment.updateMany({
      where: {
        invoiceId,
        isPaid: false
      },
      data: {
        isPaid: true,
        paidAt: new Date()
      }
    });

    logger.info('Installment payments marked as paid', { invoiceId });
  }

  /**
   * Verifica se pode pagar a fatura
   */
  static async canPayInvoice(invoiceId: number): Promise<{
    canPay: boolean;
    reason?: string;
  }> {
    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice) {
      return { canPay: false, reason: 'Fatura não encontrada' };
    }

    if (invoice.isPaid) {
      return { canPay: false, reason: 'Fatura já foi paga' };
    }

    if (invoice.status === InvoiceStatus.CANCELED) {
      return { canPay: false, reason: 'Fatura cancelada' };
    }

    const remainingAmount = parseDecimal(invoice.remainingAmount);
    if (remainingAmount.lte(0)) {
      return { canPay: false, reason: 'Não há valor a pagar' };
    }

    return { canPay: true };
  }

  /**
   * Valida valor de pagamento
   */
  static async validatePaymentAmount(invoiceId: number, amount: number | string): Promise<boolean> {
    const invoice = await CreditCardInvoiceService.getById(invoiceId);
    if (!invoice) {
      throw new Error('Fatura não encontrada');
    }

    const paymentAmount = parseDecimal(amount);
    const minimumPayment = parseDecimal(invoice.minimumPayment);
    const totalAmount = parseDecimal(invoice.totalAmount);

    if (paymentAmount.lt(minimumPayment)) {
      throw new Error('Valor menor que o pagamento mínimo');
    }

    if (paymentAmount.gt(totalAmount)) {
      throw new Error('Valor maior que o total da fatura');
    }

    return true;
  }

  /**
   * Lista pagamentos de uma fatura
   */
  static async getInvoicePayments(invoiceId: number): Promise<CreditCardInvoicePayment[]> {
    return prisma.creditCardInvoicePayment.findMany({
      where: { invoiceId },
      include: {
        transaction: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        paymentDate: 'desc'
      }
    });
  }

  /**
   * Busca histórico de pagamentos de um cartão
   */
  static async getPaymentHistory(
    accountId: number,
    params?: {
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<CreditCardInvoicePayment[]> {
    const where: any = {
      invoice: {
        financialAccountId: accountId
      }
    };

    if (params?.startDate || params?.endDate) {
      where.paymentDate = {};
      if (params.startDate) {
        where.paymentDate.gte = params.startDate;
      }
      if (params.endDate) {
        where.paymentDate.lte = params.endDate;
      }
    }

    return prisma.creditCardInvoicePayment.findMany({
      where,
      include: {
        invoice: {
          select: {
            id: true,
            referenceMonth: true,
            referenceYear: true,
            totalAmount: true
          }
        },
        transaction: true
      },
      orderBy: {
        paymentDate: 'desc'
      },
      take: params?.limit
    });
  }

  /**
   * Calcula resumo de pagamentos de uma empresa
   */
  static async getPaymentSummary(companyId: number, startDate: Date, endDate: Date) {
    const payments = await prisma.creditCardInvoicePayment.findMany({
      where: {
        invoice: {
          companyId
        },
        paymentDate: {
          gte: startDate,
          lte: endDate
        }
      },
      include: {
        invoice: {
          include: {
            financialAccount: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    const totalPaid = payments.reduce(
      (sum, p) => sum.plus(parseDecimal(p.amount)),
      new Decimal(0)
    );

    const byType = payments.reduce((acc, p) => {
      const type = p.paymentType;
      if (!acc[type]) {
        acc[type] = { count: 0, total: new Decimal(0) };
      }
      acc[type].count++;
      acc[type].total = acc[type].total.plus(parseDecimal(p.amount));
      return acc;
    }, {} as Record<string, { count: number; total: Decimal }>);

    return {
      totalPayments: payments.length,
      totalAmount: totalPaid.toNumber(),
      byType: Object.entries(byType).map(([type, data]) => ({
        type,
        count: data.count,
        total: data.total.toNumber()
      })),
      payments
    };
  }
}
