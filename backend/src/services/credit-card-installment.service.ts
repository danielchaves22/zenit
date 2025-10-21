import { PrismaClient, CreditCardInstallment, FinancialTransaction } from '@prisma/client';
import { logger } from '../utils/logger';
import { parseDecimal } from '../utils/money';
import Decimal from 'decimal.js';
import FinancialTransactionService from './financial-transaction.service';
import CreditCardInvoiceService from './credit-card-invoice.service';
import CreditCardConfigService from './credit-card-config.service';

const prisma = new PrismaClient();

export default class CreditCardInstallmentService {
  /**
   * Cria uma compra parcelada
   */
  static async createInstallmentPurchase(data: {
    accountId: number;
    description: string;
    totalAmount: number | string;
    numberOfInstallments: number;
    purchaseDate: Date;
    categoryId?: number;
    companyId: number;
    createdBy: number;
  }): Promise<{
    installment: CreditCardInstallment;
    transactions: FinancialTransaction[];
  }> {
    const {
      accountId,
      description,
      totalAmount,
      numberOfInstallments,
      purchaseDate,
      categoryId,
      companyId,
      createdBy
    } = data;

    // Validações
    if (numberOfInstallments < 2 || numberOfInstallments > 48) {
      throw new Error('Número de parcelas deve estar entre 2 e 48');
    }

    const parsedTotal = parseDecimal(totalAmount);
    if (parsedTotal.lte(0)) {
      throw new Error('Valor total deve ser maior que zero');
    }

    // Verificar configuração do cartão
    const config = await CreditCardConfigService.getByAccountId(accountId);
    if (!config) {
      throw new Error(`Conta ID ${accountId} não possui configuração de cartão`);
    }

    // Verificar limite disponível
    const hasLimit = await CreditCardConfigService.checkLimitAvailable(accountId, totalAmount);
    if (!hasLimit) {
      throw new Error('Limite de crédito insuficiente para esta compra');
    }

    // Calcular valor de cada parcela
    const installmentAmount = parsedTotal.div(numberOfInstallments);

    // Calcular primeira data de vencimento (próxima fatura)
    const firstDueDate = new Date(purchaseDate);
    firstDueDate.setDate(config.closingDay);
    if (firstDueDate <= purchaseDate) {
      firstDueDate.setMonth(firstDueDate.getMonth() + 1);
    }

    // Criar registro de parcelamento
    const installment = await prisma.creditCardInstallment.create({
      data: {
        financialAccountId: accountId,
        companyId,
        description,
        totalAmount: parsedTotal.toNumber(),
        numberOfInstallments,
        installmentAmount: installmentAmount.toNumber(),
        purchaseDate,
        firstDueDate,
        categoryId,
        createdBy
      }
    });

    // Criar transações para cada parcela
    const transactions: FinancialTransaction[] = [];
    let currentDate = new Date(firstDueDate);

    for (let i = 1; i <= numberOfInstallments; i++) {
      const parcela = `${i}/${numberOfInstallments}`;
      const transactionDesc = `${description} - Parcela ${parcela}`;

      // Buscar ou criar fatura para este mês
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      let invoice = await CreditCardInvoiceService.getInvoiceByPeriod(accountId, month, year);
      if (!invoice) {
        invoice = await CreditCardInvoiceService.generateInvoice(accountId, month, year);
      }

      // Criar transação
      const transaction = await prisma.financialTransaction.create({
        data: {
          description: transactionDesc,
          amount: installmentAmount.toNumber(),
          date: currentDate,
          dueDate: currentDate,
          effectiveDate: currentDate,
          type: 'EXPENSE',
          status: 'COMPLETED',
          fromAccountId: accountId,
          categoryId,
          companyId,
          createdBy
        }
      });

      // Vincular à fatura
      await CreditCardInvoiceService.addTransactionToInvoice(invoice.id, transaction.id, installment.id);

      // Criar registro de pagamento de parcela
      await prisma.creditCardInstallmentPayment.create({
        data: {
          installmentId: installment.id,
          invoiceId: invoice.id,
          installmentNumber: i,
          amount: installmentAmount.toNumber(),
          dueDate: currentDate,
          isPaid: false
        }
      });

      transactions.push(transaction);

      // Avançar para próximo mês
      currentDate = new Date(currentDate);
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    // Atualizar limite usado
    await CreditCardConfigService.updateUsedLimit(accountId, parsedTotal.toNumber(), 'add');

    logger.info('Installment purchase created', {
      installmentId: installment.id,
      accountId,
      totalAmount: parsedTotal.toNumber(),
      numberOfInstallments,
      installmentAmount: installmentAmount.toNumber(),
      transactionsCreated: transactions.length
    });

    return { installment, transactions };
  }

  /**
   * Busca parcelamento por ID
   */
  static async getById(id: number) {
    return prisma.creditCardInstallment.findUnique({
      where: { id },
      include: {
        financialAccount: true,
        category: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        installmentPayments: {
          include: {
            invoice: {
              select: {
                id: true,
                referenceMonth: true,
                referenceYear: true,
                status: true
              }
            }
          },
          orderBy: {
            installmentNumber: 'asc'
          }
        }
      }
    });
  }

  /**
   * Lista parcelamentos de uma conta
   */
  static async listByAccount(accountId: number) {
    return prisma.creditCardInstallment.findMany({
      where: { financialAccountId: accountId },
      include: {
        category: true,
        installmentPayments: {
          select: {
            isPaid: true,
            paidAt: true
          }
        }
      },
      orderBy: {
        purchaseDate: 'desc'
      }
    });
  }

  /**
   * Busca parcelamentos ativos (com parcelas pendentes)
   */
  static async getActiveInstallments(accountId: number) {
    const installments = await prisma.creditCardInstallment.findMany({
      where: {
        financialAccountId: accountId
      },
      include: {
        installmentPayments: true
      }
    });

    // Filtrar apenas os que têm parcelas não pagas
    return installments.filter(inst =>
      inst.installmentPayments.some(payment => !payment.isPaid)
    );
  }

  /**
   * Calcula parcelas restantes
   */
  static async getRemainingInstallments(installmentId: number): Promise<number> {
    const payments = await prisma.creditCardInstallmentPayment.findMany({
      where: {
        installmentId,
        isPaid: false
      }
    });

    return payments.length;
  }

  /**
   * Calcula valor total restante
   */
  static async getTotalRemaining(installmentId: number): Promise<number> {
    const payments = await prisma.creditCardInstallmentPayment.findMany({
      where: {
        installmentId,
        isPaid: false
      }
    });

    const total = payments.reduce(
      (sum, payment) => sum.plus(parseDecimal(payment.amount)),
      new Decimal(0)
    );

    return total.toNumber();
  }

  /**
   * Cancela um parcelamento (apenas parcelas futuras não pagas)
   */
  static async cancelInstallment(id: number): Promise<void> {
    const installment = await this.getById(id);
    if (!installment) {
      throw new Error(`Parcelamento ID ${id} não encontrado`);
    }

    // Buscar parcelas não pagas
    const unpaidPayments = installment.installmentPayments.filter(p => !p.isPaid);

    for (const payment of unpaidPayments) {
      // Buscar e cancelar transação correspondente
      const invoiceTransaction = await prisma.creditCardInvoiceTransaction.findFirst({
        where: {
          invoiceId: payment.invoiceId,
          installmentId: id
        },
        include: {
          transaction: true
        }
      });

      if (invoiceTransaction) {
        // Cancelar transação
        await prisma.financialTransaction.update({
          where: { id: invoiceTransaction.transactionId },
          data: { status: 'CANCELED' }
        });

        // Remover da fatura
        await CreditCardInvoiceService.removeTransactionFromInvoice(
          payment.invoiceId,
          invoiceTransaction.transactionId
        );
      }
    }

    logger.info('Installment canceled', {
      installmentId: id,
      canceledPayments: unpaidPayments.length
    });
  }
}
