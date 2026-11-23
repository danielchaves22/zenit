import { CreditCardInvoiceStatus, Prisma, TransactionStatus } from '@prisma/client';
import { __private__, addReconciliationDescriptionSuggestions } from '../../src/services/credit-card-statement-reconciliation.service';
import * as descriptionSuggestions from '../../src/services/reconciliation-description-suggestion.service';
import { logger } from '../../src/utils/logger';
import type { CreditCardDescriptionHistoryOption } from '../../src/services/credit-card-reconciliation-history.service';
import { creditCardOfx } from '../fixtures/credit-card-ofx';

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

const sampleCaixaOpenStatementText = `
Total parcial (R$):	2.368,84C
Cotação Dólar em 23/06/2026 (R$):	5,3825
* Cotação da data de realização da compra, exceto quando feita a opção por cotação no pagamento/vencimento da fatura.Seta  Saldos
Saldo disponível de Credito:	0,00
Saldo disponível para Saques:	0,00
Seta  ANA CLAUDIA S F CHAVES - 421960XXXXXX7139
Movimentações Nacionais em Reais (R$)
DATA	DESCRITIVO	CRÉDITO	DÉBITO
16/02	CICERO ELETRICI 05 10		341,19
25/02	SYMA SOLUTIONS 05 10		124,90
19/03	JIM COM ESSENCI 04 10		191,80
08/05	FEITO CRIANCA 02 05		127,76
16/06	AJUSTE CRED PARC S JUROS	0,06	
Movimentações Internacionais
* Não foram encontrados lançamentos
Seta  DANIEL GONCALVES CHAVES - 421960XXXXXX9665
Movimentações Nacionais em Reais (R$)
DATA	DESCRITIVO	CRÉDITO	DÉBITO
04/03	BAVELLONISECC 04 06		410,00
07/03	CARMEN STEFFENS 04 05		166,96
08/03	CENTAURO CE145 04 04		85,01
07/05	CAPPTA DOCE MO 02 04		324,75
11/05	HAVAN MARINGA A 02 10		60,00
05/06	PANIFICADORA CHIK		26,29
08/06	INDIGO		17,00
09/06	AJUSTE CRED PARC S JUROS	0,02	
10/06	IG MAUATENISCLU		220,00
11/06	SANTA PIZZA		119,90
12/06	AJUSTE CRED PARC S JUROS	0,01	
17/06	CAIXA RESIDENCIAL		84,37
03/07	05 PARCELA ANUIDADE		69,00
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

  it('marks same-date installments with a one-cent difference in the same invoice as similar', () => {
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
          matchKey: 'transaction:412',
          matchSource: 'TRANSACTION',
          id: 412,
          fixedTemplateId: null,
          occurrenceKey: null,
          description: 'Magico Aniversario Cibele',
          amount: new Prisma.Decimal('471.01'),
          date: new Date('2026-05-10T12:00:00.000Z'),
          installmentNumber: 4,
          totalInstallments: 10,
          status: TransactionStatus.COMPLETED,
          purchaseGroupId: 'purchase-group-412',
          creditCardInvoice: {
            id: 82,
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
    expect(classification.reason).toBe('AMOUNT_DIVERGENCE');
    expect(classification.matchedTransactions).toHaveLength(1);
  });

  it('ignores other installments from different invoice references when checking installment divergence', () => {
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
          matchKey: 'transaction:511',
          matchSource: 'TRANSACTION',
          id: 511,
          fixedTemplateId: null,
          occurrenceKey: null,
          description: 'Pintura casa aluguel',
          amount: new Prisma.Decimal('471.00'),
          date: new Date('2026-05-10T12:00:00.000Z'),
          installmentNumber: 9,
          totalInstallments: 10,
          status: TransactionStatus.COMPLETED,
          purchaseGroupId: 'purchase-group-511',
          creditCardInvoice: {
            id: 91,
            referenceYear: 2027,
            referenceMonth: 1,
            status: CreditCardInvoiceStatus.OPEN
          }
        }
      ],
      2026,
      6
    );

    expect(classification.status).toBe('PENDING');
    expect(classification.reason).toBe('NO_MATCH');
    expect(classification.matchedTransactions).toHaveLength(0);
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

  it('parses the Caixa open statement text layout copied from the invoice screen', () => {
    const parsed = __private__.parseCaixaOpenStatementText(
      sampleCaixaOpenStatementText,
      'caixa_23062026.txt'
    );

    expect(parsed.sourceType).toBe('CAIXA_PDF');
    expect(parsed.totalAmount).toBe('2368.84');
    expect(parsed.parsedNetAmount).toBe('2368.84');
    expect(parsed.referenceYear).toBe(2026);
    expect(parsed.referenceMonth).toBe(6);
    expect(parsed.items).toHaveLength(18);

    expect(parsed.items[0]).toMatchObject({
      kind: 'INSTALLMENT',
      amount: '341.19',
      installmentNumber: 5,
      totalInstallments: 10,
      sourceDescription: 'CICERO ELETRICI',
      sourceSection: 'INSTALLMENTS',
      cardSuffix: '7139'
    });
    expect(parsed.items[4]).toMatchObject({
      kind: 'ADJUSTMENT',
      direction: 'CREDIT',
      amount: '0.06',
      canImport: false,
      canImportAsCredit: true,
      sourceDescription: 'AJUSTE CRED PARC S JUROS',
      sourceSection: 'OTHER'
    });
    expect(parsed.items[17]).toMatchObject({
      kind: 'ANNUITY',
      amount: '69',
      installmentNumber: 5,
      totalInstallments: null,
      sourceDescription: 'ANUIDADE',
      sourceSection: 'ANNUITY',
      cardSuffix: '9665'
    });
    expect(parsed.items[17]?.purchaseDate?.getFullYear()).toBe(2026);
    expect(parsed.items[17]?.purchaseDate?.getMonth()).toBe(6);
    expect(parsed.items[17]?.purchaseDate?.getDate()).toBe(3);
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
      canImportAsCredit: false,
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

  it.each([false, true])('normalizes Nubank OFX signs and preserves invoice item classifications (XML=%s)', (xml) => {
    const parsed = __private__.parseNubankOfxStatement(creditCardOfx([
      { id: 'purchase', date: '20260609235959[-3:BRT]', amount: '-59.90', description: 'Netflix Entretenimento' },
      { id: 'tax', date: '20260603', amount: '-1.17', description: 'IOF de compra internacional' },
      { id: 'payment', date: '20260510', amount: '625.29', description: 'Pagamento recebido' },
      { id: 'installment-1', date: '20260510', amount: '-33.33', description: 'Ri Happy - Parcela 4/6' },
      { id: 'installment-2', date: '20260510', amount: '-471.00', description: 'Deivid Pinturas - Parcela 4/10' },
      { id: 'refund', date: '20260610', amount: '10.00', description: 'Estorno Loja' },
      { id: 'interest', date: '20260611', amount: '-2.50', description: 'Encargo do ciclo', type: 'INT' },
      { id: 'fee', date: '20260611', amount: '-1.00', description: 'Tarifa do ciclo', type: 'FEE' }
    ], { xml }), 'Nubank_2026-06-17.ofx');

    expect(parsed.sourceType).toBe('NUBANK_OFX');
    expect(parsed.parsedNetAmount).toBe('-66.39');
    expect(parsed.items[0]).toMatchObject({ kind: 'PURCHASE', direction: 'DEBIT', amount: '59.9', signedAmount: '59.9', canImport: true });
    expect(parsed.items[0].purchaseDate?.getDate()).toBe(9);
    expect(parsed.items[1]).toMatchObject({ kind: 'TAX', amount: '1.17' });
    expect(parsed.items[2]).toMatchObject({ kind: 'PAYMENT', direction: 'CREDIT', signedAmount: '-625.29', canImport: false, canImportAsCredit: false });
    expect(parsed.items[3]).toMatchObject({ kind: 'INSTALLMENT', amount: '33.33', installmentNumber: 4, totalInstallments: 6, sourceDescription: 'Ri Happy' });
    expect(parsed.items[4]).toMatchObject({ kind: 'INSTALLMENT', amount: '471', installmentNumber: 4, totalInstallments: 10 });
    expect(parsed.items[5]).toMatchObject({ kind: 'CREDIT', signedAmount: '-10', canImport: false, canImportAsCredit: true });
    expect(parsed.items[6].kind).toBe('INTEREST');
    expect(parsed.items[7].kind).toBe('FEE');

    const previewItems = __private__.buildPreviewItems(parsed, [], new Map(), new Map());
    const comparison = __private__.buildValueComparison(parsed, previewItems, []);
    expect(comparison.file).toMatchObject({
      reportedTotalAmount: null,
      comparableAmount: '558.9',
      paymentAmount: '625.29',
      creditAmount: '10',
      paymentCount: 1,
      creditCount: 1
    });
  });

  it('keeps an incoming OFX payment informational even without a Portuguese payment description', () => {
    const parsed = __private__.parseNubankOfxStatement(creditCardOfx([
      { id: 'payment', date: '20260610', amount: '100.00', description: 'Received', type: 'PAYMENT' },
      { id: 'zero', date: '20260610', amount: '0.00', description: 'Sem valor', type: 'OTHER' }
    ]), null);
    expect(parsed.items[0]).toMatchObject({ kind: 'PAYMENT', canImport: false, canImportAsCredit: false });
    expect(parsed.items[1]).toMatchObject({ amount: '0', canImport: false, canImportAsCredit: false });
  });

  it('includes a boleto paid with the card in invoice charges and excludes a card bill payment', () => {
    const parsed = __private__.parseNubankOfxStatement(creditCardOfx([
      { id: 'boleto', date: '20260610', amount: '-47.00', description: 'Pagamento de boleto no crédito', type: 'PAYMENT' },
      { id: 'bill-payment', date: '20260612', amount: '100.00', description: 'Pagamento recebido', type: 'PAYMENT' }
    ]), null);

    expect(parsed.items[0]).toMatchObject({ kind: 'PURCHASE', direction: 'DEBIT', canImport: true });
    expect(parsed.items[1]).toMatchObject({ kind: 'PAYMENT', direction: 'CREDIT', canImport: false, canImportAsCredit: false });
    const preview = __private__.buildPreviewItems(parsed, [], new Map(), new Map());
    expect(__private__.buildValueComparison(parsed, preview, []).file).toMatchObject({
      comparableAmount: '47', debitAmount: '47', paymentAmount: '100', paymentCount: 1
    });
  });

  it('rejects invalid installment counts from the OFX description', () => {
    const invalid = creditCardOfx([
      { id: 'invalid-installment', date: '20260610', amount: '-100', description: 'Loja - Parcela 4/3' }
    ]);
    expect(() => __private__.parseNubankOfxStatement(invalid, null)).toThrow('Parcelamento invalido');
  });

  it('allows both Nubank formats only for Nubank and shares recurring-description aliases', () => {
    expect(__private__.isCompatibleReconciliationSource('NUBANK_OFX', 'NUBANK_CSV')).toBe(true);
    expect(__private__.isCompatibleReconciliationSource('NUBANK_CSV', 'NUBANK_CSV')).toBe(true);
    expect(__private__.isCompatibleReconciliationSource('NUBANK_OFX', 'BRADESCO_CSV')).toBe(false);
    expect(__private__.isCompatibleReconciliationSource('NUBANK_OFX', 'CAIXA_PDF')).toBe(false);
    expect(__private__.descriptionAliasSourceType('NUBANK_OFX')).toBe('NUBANK_CSV');
    expect(__private__.descriptionAliasSourceType('NUBANK_CSV')).toBe('NUBANK_CSV');
    expect(__private__.descriptionAliasSourceType('BRADESCO_CSV')).toBe('BRADESCO_CSV');
  });

  describe('confirmed description history', () => {
    const parsed = __private__.parseNubankOfxStatement(creditCardOfx([
      { id: 'synthetic-shop', date: '20260609', amount: '-20.00', description: 'POS EXEMPLO' }
    ]), null);
    const item = parsed.items[0];
    const learned = {
      description: 'Feira do bairro', categoryId: 2, categoryName: 'Feira', count: 3,
      lastConfirmedAt: '2026-03-01T12:00:00.000Z'
    };
    const other = {
      description: 'Presente', categoryId: 3, categoryName: 'Presentes', count: 1,
      lastConfirmedAt: '2026-05-01T12:00:00.000Z'
    };
    const fallback = {
      categoryId: 1, categoryName: 'Compras', categoryIcon: null, categoryColor: null,
      source: 'RULE' as const, reason: 'Sugestão anterior'
    };
    const candidate = (id: number, description: string) => ({
      matchKey: `transaction:${id}`, matchSource: 'TRANSACTION' as const, id,
      fixedTemplateId: null, occurrenceKey: null, description, amount: new Prisma.Decimal('20.00'),
      date: item.purchaseDate!, installmentNumber: null, totalInstallments: null,
      status: TransactionStatus.COMPLETED, purchaseGroupId: null, creditCardInvoice: null
    });
    const candidates = [candidate(1, 'Livro'), candidate(2, 'Feira do bairro')];
    const preview = (options: CreditCardDescriptionHistoryOption[], transactions = candidates) =>
      __private__.buildPreviewItems(parsed, transactions, new Map([[item.id, fallback]]), new Map(),
        new Map([[item.id, options]]))[0];

    it('enriches expense and credit drafts in one lookup without changing local categories or match candidates', async () => {
      const debit = preview([learned]);
      const credit = { ...debit, id: 'credit', sourceDescription: 'ESTORNO', canImport: false, canImportAsCredit: true };
      const ineligible = { ...debit, id: 'total', canImport: false, canImportAsCredit: false };
      const unknown = { ...debit, id: 'other', sourceDescription: 'OUTRO' };
      const lookup = jest.spyOn(descriptionSuggestions, 'loadReconciliationDescriptionSuggestions')
        .mockResolvedValue(new Map([[debit.sourceDescription, 'Nome mais recente'], ['ESTORNO', 'Devolução']]));
      try {
        const rows = [debit, credit, ineligible, unknown, { ...debit, id: 'duplicate' }];
        const result = await addReconciliationDescriptionSuggestions(rows, { companyId: 99, userId: 42 });
        expect(lookup).toHaveBeenCalledTimes(1);
        expect(lookup).toHaveBeenCalledWith({ companyId: 99, userId: 42, sourceDescriptions: [debit.sourceDescription, 'ESTORNO', 'OUTRO'] });
        expect(result).toEqual(rows.map((row, i) => ({
          ...row, suggestedDescription: ['Nome mais recente', 'Devolução', null, null, 'Nome mais recente'][i]
        })));
        expect(debit).not.toHaveProperty('suggestedDescription');
      } finally {
        lookup.mockRestore();
      }
    });

    it('keeps the local preview available when shared history fails and omits financial data from the warning', async () => {
      const row = preview([learned]);
      const lookup = jest.spyOn(descriptionSuggestions, 'loadReconciliationDescriptionSuggestions')
        .mockRejectedValue(new Error(row.sourceDescription));
      const log = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
      try {
        await expect(addReconciliationDescriptionSuggestions([row], { companyId: 99, userId: 42 }))
          .resolves.toEqual([{ ...row, suggestedDescription: null }]);
        expect(log).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(log.mock.calls)).not.toContain(row.sourceDescription);
      } finally {
        lookup.mockRestore();
        log.mockRestore();
      }
    });

    it('suggests the latest confirmed pair for a draft even when another option was used more often', () => {
      expect(preview([learned], [])).toMatchObject({
        sourceDescription: 'POS EXEMPLO', historyOptions: [learned],
        categorySuggestion: { source: 'HISTORY', categoryId: 2 }
      });
      expect(preview([other, learned], [])).toMatchObject({
        sourceDescription: 'POS EXEMPLO', historyOptions: [other, learned],
        categorySuggestion: { categoryId: 3, categoryName: 'Presentes', source: 'HISTORY' }
      });
      expect(preview([], []).categorySuggestion).toEqual(fallback);
    });

    it('keeps the most recent description and its missing category together', () => {
      const uncategorized = { ...other, categoryId: null, categoryName: null };
      expect(preview([uncategorized, learned], [])).toMatchObject({
        historyOptions: [uncategorized, learned], categorySuggestion: { categoryId: null, categoryName: null, source: null }
      });
    });

    it('ranks a historically named exact candidate for human review while preserving both candidates', () => {
      const row = preview([learned]);
      expect(row).toMatchObject({ status: 'SIMILAR', reason: 'AMBIGUOUS_EXACT', historySuggestedMatchKey: 'transaction:2' });
      expect(row.matchedTransactions.map(match => match.id)).toEqual([2, 1]);
      const multiplePairs = preview([other, learned], [
        candidate(1, learned.description),
        candidate(2, other.description)
      ]);
      expect(multiplePairs).toMatchObject({
        status: 'SIMILAR', reason: 'AMBIGUOUS_EXACT', historySuggestedMatchKey: null,
        categorySuggestion: { categoryId: 3 }
      });
      expect(multiplePairs.matchedTransactions.map(match => match.id)).toEqual([1, 2]);
      expect(preview([learned], [candidate(1, learned.description), candidate(2, learned.description)]).historySuggestedMatchKey).toBeNull();
    });

    it('requires matching date, amount and installment terms and withholds a contested recommendation', () => {
      const financiallyDifferent = [
        { ...candidate(3, learned.description), date: new Date(2026, 5, 10, 12) },
        { ...candidate(4, learned.description), amount: new Prisma.Decimal(19) },
        { ...candidate(5, learned.description), installmentNumber: 2, totalInstallments: 3 }
      ];
      const history = new Map([[item.id, [learned]]]);
      const rows = __private__.buildPreviewItems(parsed,
        [candidate(1, 'Outro'), candidate(2, 'Livro'), ...financiallyDifferent], new Map(), new Map(), history);
      expect(rows[0].historySuggestedMatchKey).toBeNull();
      expect(rows[0].matchedTransactions.map(match => match.id)).toEqual([1, 2]);

      const competingItem = { ...item, id: 'another-row', sourceDescription: 'Outro item da fatura' };
      const competing = __private__.buildPreviewItems({ ...parsed, items: [item, competingItem] },
        candidates, new Map(), new Map(), history);
      expect(competing.map(row => row.historySuggestedMatchKey)).toEqual([null, null]);
      expect(competing[0].matchedTransactions.map(match => match.id)).toEqual([1, 2]);
    });
  });

  it('separates Nubank payments and explains the total difference from item composition', () => {
    const parsed = __private__.parseNubankStatementText(
      sampleNubankStatementText,
      'Nubank_2026-06-17.csv'
    );
    const invoice = {
      id: 91,
      referenceYear: 2026,
      referenceMonth: 6,
      status: CreditCardInvoiceStatus.OPEN
    };
    const candidate = (
      id: number,
      description: string,
      amount: string,
      date: string,
      installmentNumber: number | null = null,
      totalInstallments: number | null = null
    ) => ({
      matchKey: `transaction:${id}`,
      matchSource: 'TRANSACTION' as const,
      id,
      fixedTemplateId: null,
      occurrenceKey: null,
      description,
      amount: new Prisma.Decimal(amount),
      date: new Date(date),
      installmentNumber,
      totalInstallments,
      status: TransactionStatus.COMPLETED,
      purchaseGroupId: null,
      creditCardInvoice: invoice
    });
    const candidates = [
      candidate(1, 'Netflix Entretenimento', '59.90', '2026-06-09T12:00:00.000Z'),
      candidate(2, 'IOF de compra internacional', '1.17', '2026-06-03T12:00:00.000Z'),
      candidate(3, 'Ri Happy', '33.34', '2026-05-10T12:00:00.000Z', 4, 6),
      candidate(4, 'Lançamento somente no Zenit', '10.00', '2026-06-08T12:00:00.000Z')
    ];
    const items = __private__.buildPreviewItems(
      parsed,
      candidates,
      new Map(),
      new Map()
    );

    const comparison = __private__.buildValueComparison(parsed, items, candidates);

    expect(comparison.file).toMatchObject({
      reportedTotalAmount: null,
      comparableAmount: '565.4',
      paymentAmount: '625.29',
      paymentCount: 1,
      netAmount: '-59.89'
    });
    expect(comparison.zenit).toEqual({ totalAmount: '104.41', itemCount: 4 });
    expect(comparison).toMatchObject({
      status: 'EXPLAINED',
      differenceAmount: '-460.99',
      explainedDifferenceAmount: '-460.99',
      unexplainedDifferenceAmount: '0',
      pairedCount: 3,
      exactAmountCount: 2,
      amountDivergenceCount: 1,
      missingCount: 1,
      extraCount: 1,
      ambiguousCount: 0
    });
    expect(comparison.amountDivergences[0]).toMatchObject({
      sourceDescription: 'Ri Happy',
      fileAmount: '33.33',
      zenitAmount: '33.34',
      differenceAmount: '0.01'
    });
    expect(comparison.missingItems[0]).toMatchObject({
      description: 'Deivid Pinturas',
      amount: '471'
    });
    expect(comparison.extraItems[0]).toMatchObject({
      description: 'Lançamento somente no Zenit',
      amount: '10'
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
