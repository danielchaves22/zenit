import { CreditCardInvoiceStatus, Prisma, TransactionStatus } from '@prisma/client';
import { __private__ } from '../../src/services/credit-card-statement-reconciliation.service';

const sampleCaixaStatementText = `
VENCIMENTO
14/06/2026
VALOR TOTAL DESTA FATURA
R$ 4.775,36
Demonstrativo
DataDescriçãoCidade/PaísValor U$$Crédito/Débito
04/05TOTAL DA FATURA ANTERIOR2.789,82D
15/05JUROS ATRASO ROTATIVO35,12D
20/05OBRIGADO PELO PAGAMENTO2.789,82C
DANIEL GONCALVES CHAVES (Cartão 9665)
ANUIDADE
Crédito/Débito R$
ANUIDADE DIFERENCIADA TIT 04/   1269,00D
COMPRAS (Cartão 9665)
DataDescriçãoCidade/PaísValor U$$Crédito/Débito
07/05PANVEL FARMACIAS FL 56MARINGA35,48D
COMPRAS PARCELADAS (Cartão 9665)
DataDescriçãoCidade/PaísValor U$$Crédito/Débito
03/03DEPOSITO BORBA GATO MA    04 DE 04MARINGA174,60D
OUTROS (Cartão 9665)
DataDescriçãoCidade/PaísValor U$$Crédito/Débito
04/06IOF BASE DE ROTATIVO1,14D
Total OUTROS1,14D
Total final (cartão 9665)3.146,74D
Legenda
`.trim();

const sampleBradescoStatementText = `
Data: 09/06/2026 05:39:40

Situação da Fatura: PAGO

DANIEL G CHAVES ;;; 5456
Data;Histórico;Valor(US$);Valor(R$);
15/05;SALDO ANTERIOR ;0,00;3583,84
15/05;PAGTO. POR DEB EM C/C ;0,00;-3583,84
11/05;IOF S/ TRANS INTER REAIS ;0,00;22,75
08/05;LINK   VIVAZ SEMI JOIAS 1/3;0,00;103,00

DANIEL G CHAVES ;;; 2724
Data;Histórico;Valor(US$);Valor(R$);
07/05;OPENAI *CHATGPT SUBSCR ;92,72;480,29

Total da fatura em Real: ;;;606,04
`.trim();

const sampleNubankStatementText = `
date,title,amount
2026-06-09,Netflix Entretenimento,"59,90"
2026-06-03,IOF de compra internacional,"1,17"
2026-05-10,Pagamento recebido,"- 625,29"
2026-05-10,Ri Happy - Parcela 4/6,"33,33"
2026-05-10,Deivid Pinturas - Parcela 4/10,"471,00"
`.trim();

describe('Credit card statement reconciliation service', () => {
  it('parses the Caixa statement layout, including annuity installments', () => {
    const parsed = __private__.parseCaixaStatementText(
      sampleCaixaStatementText,
      'FaturaCaixa_062026.pdf'
    );

    expect(parsed.totalAmount).toBe('4775.36');
    expect(parsed.parsedNetAmount).toBe('315.34');
    expect(parsed.items).toHaveLength(7);

    const annuityItem = parsed.items.find((item) => item.kind === 'ANNUITY');
    const purchaseItem = parsed.items.find((item) => item.kind === 'PURCHASE');
    const installmentItem = parsed.items.find((item) => item.kind === 'INSTALLMENT');
    const taxItem = parsed.items.find((item) => item.kind === 'TAX');

    expect(annuityItem).toMatchObject({
      amount: '69',
      installmentNumber: 4,
      totalInstallments: 12,
      purchaseDate: null,
      sourceSection: 'ANNUITY',
      sourceDescription: 'ANUIDADE DIFERENCIADA TIT'
    });
    expect(purchaseItem).toMatchObject({
      amount: '35.48',
      sourceSection: 'PURCHASES'
    });
    expect(installmentItem).toMatchObject({
      amount: '174.6',
      installmentNumber: 4,
      totalInstallments: 4,
      sourceSection: 'INSTALLMENTS'
    });
    expect(taxItem).toMatchObject({
      amount: '1.14',
      sourceSection: 'OTHER'
    });
  });

  it('matches existing launches without considering description', () => {
    const parsed = __private__.parseCaixaStatementText(
      sampleCaixaStatementText,
      'FaturaCaixa_062026.pdf'
    );
    const purchaseItem = parsed.items.find((item) => item.kind === 'PURCHASE');

    expect(purchaseItem).toBeTruthy();

    const classification = __private__.classifyMatches(
      purchaseItem!,
      [
        {
          matchKey: 'transaction:91',
          matchSource: 'TRANSACTION',
          id: 91,
          fixedTemplateId: null,
          occurrenceKey: null,
          description: 'Descricao interna completamente diferente',
          amount: new Prisma.Decimal('35.48'),
          date: new Date('2026-05-07T12:00:00.000Z'),
          installmentNumber: null,
          totalInstallments: null,
          status: TransactionStatus.COMPLETED,
          purchaseGroupId: null,
          creditCardInvoice: null
        }
      ],
      2026,
      6
    );

    expect(classification.status).toBe('OK');
    expect(classification.reason).toBe('EXACT');
    expect(classification.matchedTransactions).toHaveLength(1);
  });

  it('marks same purchase as similar when it is linked to a different invoice', () => {
    const parsed = __private__.parseCaixaStatementText(
      sampleCaixaStatementText,
      'FaturaCaixa_062026.pdf'
    );
    const purchaseItem = parsed.items.find((item) => item.kind === 'PURCHASE');

    expect(purchaseItem).toBeTruthy();

    const classification = __private__.classifyMatches(
      purchaseItem!,
      [
        {
          matchKey: 'transaction:191',
          matchSource: 'TRANSACTION',
          id: 191,
          fixedTemplateId: null,
          occurrenceKey: null,
          description: 'Descricao interna',
          amount: new Prisma.Decimal('35.48'),
          date: new Date('2026-05-07T12:00:00.000Z'),
          installmentNumber: null,
          totalInstallments: null,
          status: TransactionStatus.COMPLETED,
          purchaseGroupId: null,
          creditCardInvoice: {
            id: 71,
            referenceYear: 2026,
            referenceMonth: 5,
            status: CreditCardInvoiceStatus.CLOSED
          }
        }
      ],
      2026,
      6
    );

    expect(classification.status).toBe('SIMILAR');
    expect(classification.reason).toBe('INVOICE_DIVERGENCE');
    expect(classification.matchedTransactions).toHaveLength(1);
  });

  it('uses persisted source description only as an auxiliary exact-match disambiguator', () => {
    const parsed = __private__.parseCaixaStatementText(
      sampleCaixaStatementText,
      'FaturaCaixa_062026.pdf'
    );
    const purchaseItem = parsed.items.find((item) => item.kind === 'PURCHASE');

    expect(purchaseItem).toBeTruthy();

    const classification = __private__.classifyMatches(
      purchaseItem!,
      [
        {
          matchKey: 'transaction:91',
          matchSource: 'TRANSACTION',
          id: 91,
          fixedTemplateId: null,
          occurrenceKey: null,
          description: 'Descricao interna A',
          amount: new Prisma.Decimal('35.48'),
          date: new Date('2026-05-07T12:00:00.000Z'),
          installmentNumber: null,
          totalInstallments: null,
          status: TransactionStatus.COMPLETED,
          purchaseGroupId: null,
          importSourceDescription: 'OUTRA DESCRICAO',
          creditCardInvoice: null
        },
        {
          matchKey: 'transaction:92',
          matchSource: 'TRANSACTION',
          id: 92,
          fixedTemplateId: null,
          occurrenceKey: null,
          description: 'Descricao interna B',
          amount: new Prisma.Decimal('35.48'),
          date: new Date('2026-05-07T12:00:00.000Z'),
          installmentNumber: null,
          totalInstallments: null,
          status: TransactionStatus.COMPLETED,
          purchaseGroupId: null,
          importSourceDescription: purchaseItem!.sourceDescription,
          creditCardInvoice: null
        }
      ],
      2026,
      6
    );

    expect(classification.status).toBe('OK');
    expect(classification.reason).toBe('EXACT');
    expect(classification.matchedTransactions).toHaveLength(1);
    expect(classification.matchedTransactions[0]?.id).toBe(92);
  });

  it('marks projected fixed card expenses as similar when amount matches the statement month', () => {
    const parsed = __private__.parseCaixaStatementText(
      sampleCaixaStatementText,
      'FaturaCaixa_062026.pdf'
    );
    const purchaseItem = parsed.items.find((item) => item.kind === 'PURCHASE');

    expect(purchaseItem).toBeTruthy();

    const classification = __private__.classifyMatches(
      purchaseItem!,
      [
        {
          matchKey: 'projected-fixed:18:18:2026-06',
          matchSource: 'PROJECTED_FIXED',
          id: null,
          fixedTemplateId: 18,
          occurrenceKey: '18:2026-06',
          description: 'Assinatura recorrente',
          amount: new Prisma.Decimal('35.48'),
          date: new Date('2026-06-10T12:00:00.000Z'),
          installmentNumber: null,
          totalInstallments: null,
          status: TransactionStatus.PENDING,
          purchaseGroupId: null,
          creditCardInvoice: {
            id: 0,
            referenceYear: 2026,
            referenceMonth: 6,
            status: CreditCardInvoiceStatus.OPEN
          }
        }
      ],
      2026,
      6
    );

    expect(classification.status).toBe('SIMILAR');
    expect(classification.reason).toBe('DATE_DIVERGENCE');
    expect(classification.matchedTransactions).toHaveLength(1);
    expect(classification.matchedTransactions[0]?.matchSource).toBe('PROJECTED_FIXED');
  });

  it('accepts small amount differences for projected fixed matches in the same statement month', () => {
    const parsed = __private__.parseNubankStatementText(
      sampleNubankStatementText,
      'Nubank_2026-06-17.csv'
    );
    const purchaseItem = parsed.items.find((item) => item.kind === 'PURCHASE');

    expect(purchaseItem).toBeTruthy();

    const classification = __private__.classifyMatches(
      purchaseItem!,
      [
        {
          matchKey: 'projected-fixed:18:18:2026-06',
          matchSource: 'PROJECTED_FIXED',
          id: null,
          fixedTemplateId: 18,
          occurrenceKey: '18:2026-06',
          description: 'Assinatura recorrente',
          amount: new Prisma.Decimal('59.99'),
          date: new Date('2026-06-10T12:00:00.000Z'),
          installmentNumber: null,
          totalInstallments: null,
          status: TransactionStatus.PENDING,
          purchaseGroupId: null,
          creditCardInvoice: {
            id: 0,
            referenceYear: 2026,
            referenceMonth: 6,
            status: CreditCardInvoiceStatus.OPEN
          }
        }
      ],
      2026,
      6
    );

    expect(classification.status).toBe('SIMILAR');
    expect(classification.reason).toBe('DATE_DIVERGENCE');
    expect(classification.matchedTransactions).toHaveLength(1);
  });

  it('marks mapped recurring fixed descriptions as ok when a projected fixed exists in the same invoice', () => {
    const parsed = __private__.parseNubankStatementText(
      sampleNubankStatementText,
      'Nubank_2026-06-17.csv'
    );
    const purchaseItem = parsed.items.find(
      (item) => item.sourceDescription === 'Netflix Entretenimento'
    );

    expect(purchaseItem).toBeTruthy();

    const classification = __private__.classifyMatches(
      purchaseItem!,
      [
        {
          matchKey: 'projected-fixed:18:18:2026-06',
          matchSource: 'PROJECTED_FIXED',
          id: null,
          fixedTemplateId: 18,
          occurrenceKey: '18:2026-06',
          description: 'Netflix',
          amount: new Prisma.Decimal('59.90'),
          date: new Date('2026-06-10T12:00:00.000Z'),
          installmentNumber: null,
          totalInstallments: null,
          status: TransactionStatus.PENDING,
          purchaseGroupId: null,
          creditCardInvoice: {
            id: 0,
            referenceYear: 2026,
            referenceMonth: 6,
            status: CreditCardInvoiceStatus.OPEN
          }
        }
      ],
      2026,
      6,
      new Map([['NETFLIX ENTRETENIMENTO', 18]])
    );

    expect(classification.status).toBe('OK');
    expect(classification.reason).toBe('MAPPED_FIXED');
    expect(classification.matchedTransactions).toHaveLength(1);
    expect(classification.matchedTransactions[0]?.matchSource).toBe('PROJECTED_FIXED');
  });

  it('matches older installments in the same invoice reference as similar', () => {
    const parsed = __private__.parseNubankStatementText(
      sampleNubankStatementText,
      'Nubank_2026-06-17.csv'
    );
    const installmentItem = parsed.items.find(
      (item) => item.sourceDescription === 'Deivid Pinturas'
    );

    expect(installmentItem).toBeTruthy();

    const classification = __private__.classifyMatches(
      installmentItem!,
      [
        {
          matchKey: 'transaction:411',
          matchSource: 'TRANSACTION',
          id: 411,
          fixedTemplateId: null,
          occurrenceKey: null,
          description: 'Pintura casa aluguel',
          amount: new Prisma.Decimal('471.00'),
          date: new Date('2026-02-13T12:00:00.000Z'),
          installmentNumber: 4,
          totalInstallments: 10,
          status: TransactionStatus.COMPLETED,
          purchaseGroupId: 'purchase-group-411',
          creditCardInvoice: {
            id: 81,
            referenceYear: 2026,
            referenceMonth: 6,
            status: CreditCardInvoiceStatus.OPEN
          }
        }
      ],
      2026,
      6
    );

    expect(classification.status).toBe('SIMILAR');
    expect(classification.reason).toBe('DATE_DIVERGENCE');
    expect(classification.matchedTransactions).toHaveLength(1);
  });

  it('shifts statement-reference items when the target invoice reference is changed', () => {
    const parsed = __private__.parseCaixaStatementText(
      sampleCaixaStatementText,
      'FaturaCaixa_062026.pdf'
    );
    const shifted = __private__.applyTargetReferenceToStatement(parsed, {
      referenceYear: 2026,
      referenceMonth: 7
    });

    const originalAnnuityItem = parsed.items.find((item) => item.kind === 'ANNUITY');
    const shiftedAnnuityItem = shifted.items.find((item) => item.kind === 'ANNUITY');
    const originalPurchaseItem = parsed.items.find((item) => item.kind === 'PURCHASE');
    const shiftedPurchaseItem = shifted.items.find((item) => item.kind === 'PURCHASE');

    expect(originalAnnuityItem).toBeTruthy();
    expect(shiftedAnnuityItem).toBeTruthy();
    expect(originalPurchaseItem).toBeTruthy();
    expect(shiftedPurchaseItem).toBeTruthy();
    expect(shifted.referenceYear).toBe(2026);
    expect(shifted.referenceMonth).toBe(7);
    expect(shiftedAnnuityItem?.createDate.getFullYear()).toBe(2026);
    expect(shiftedAnnuityItem?.createDate.getMonth()).toBe(3);
    expect(shiftedAnnuityItem?.createDate.getDate()).toBe(1);
    expect(shiftedPurchaseItem?.createDate.getTime()).toBe(
      originalPurchaseItem?.createDate.getTime()
    );
  });

  it('parses the Bradesco CSV layout with multiple cards and installment markers', () => {
    const parsed = __private__.parseBradescoStatementText(
      sampleBradescoStatementText,
      'Bradesco_09062026_174004.csv'
    );

    expect(parsed.sourceType).toBe('BRADESCO_CSV');
    expect(parsed.totalAmount).toBe('606.04');
    expect(parsed.parsedNetAmount).toBe('606.04');
    expect(parsed.items).toHaveLength(5);

    expect(parsed.items[0]).toMatchObject({
      kind: 'BALANCE',
      canImport: false,
      sourceDescription: 'SALDO ANTERIOR',
      sourceSection: 'OTHER',
      cardSuffix: '5456'
    });
    expect(parsed.items[1]).toMatchObject({
      kind: 'PAYMENT',
      canImport: false,
      direction: 'CREDIT',
      sourceDescription: 'PAGTO. POR DEB EM C/C',
      sourceSection: 'OTHER'
    });
    expect(parsed.items[2]).toMatchObject({
      kind: 'TAX',
      amount: '22.75',
      sourceSection: 'OTHER'
    });
    expect(parsed.items[3]).toMatchObject({
      kind: 'INSTALLMENT',
      amount: '103',
      installmentNumber: 1,
      totalInstallments: 3,
      sourceDescription: 'LINK VIVAZ SEMI JOIAS',
      sourceSection: 'INSTALLMENTS',
      cardSuffix: '5456'
    });
    expect(parsed.items[4]).toMatchObject({
      kind: 'PURCHASE',
      amount: '480.29',
      sourceDescription: 'OPENAI *CHATGPT SUBSCR',
      sourceSection: 'PURCHASES',
      cardSuffix: '2724'
    });
  });

  it('parses the Nubank CSV layout with payments, taxes and installment markers', () => {
    const parsed = __private__.parseNubankStatementText(
      sampleNubankStatementText,
      'Nubank_2026-06-17.csv'
    );

    expect(parsed.sourceType).toBe('NUBANK_CSV');
    expect(parsed.totalAmount).toBe('-59.89');
    expect(parsed.parsedNetAmount).toBe('-59.89');
    expect(parsed.referenceYear).toBe(2026);
    expect(parsed.referenceMonth).toBe(6);
    expect(parsed.items).toHaveLength(5);

    expect(parsed.items[0]).toMatchObject({
      kind: 'PURCHASE',
      amount: '59.9',
      sourceDescription: 'Netflix Entretenimento',
      sourceSection: 'PURCHASES',
      cardSuffix: null
    });
    expect(parsed.items[1]).toMatchObject({
      kind: 'TAX',
      amount: '1.17',
      sourceDescription: 'IOF de compra internacional',
      sourceSection: 'OTHER'
    });
    expect(parsed.items[2]).toMatchObject({
      kind: 'PAYMENT',
      canImport: false,
      direction: 'CREDIT',
      amount: '625.29',
      sourceDescription: 'Pagamento recebido',
      sourceSection: 'OTHER'
    });
    expect(parsed.items[3]).toMatchObject({
      kind: 'INSTALLMENT',
      amount: '33.33',
      installmentNumber: 4,
      totalInstallments: 6,
      sourceDescription: 'Ri Happy',
      sourceSection: 'INSTALLMENTS'
    });
    expect(parsed.items[4]).toMatchObject({
      kind: 'INSTALLMENT',
      amount: '471',
      installmentNumber: 4,
      totalInstallments: 10,
      sourceDescription: 'Deivid Pinturas',
      sourceSection: 'INSTALLMENTS'
    });
  });

  it('expands the candidate search window backwards for installment lines', () => {
    const parsed = __private__.parseNubankStatementText(
      sampleNubankStatementText,
      'Nubank_2026-06-17.csv'
    );

    const { minDate, maxDate } = __private__.buildDateWindow(parsed.items);

    expect(minDate.getFullYear()).toBe(2026);
    expect(minDate.getMonth()).toBe(0);
    expect(minDate.getDate()).toBe(10);
    expect(maxDate.getFullYear()).toBe(2026);
    expect(maxDate.getMonth()).toBe(6);
    expect(maxDate.getDate()).toBe(10);
  });
});
