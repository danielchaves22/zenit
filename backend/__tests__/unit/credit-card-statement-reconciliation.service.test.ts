import { Prisma, TransactionStatus } from '@prisma/client';
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
          id: 91,
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
});
