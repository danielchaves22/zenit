import { describe, expect, it } from 'vitest';
import {
  buildCreditCardInvoiceCsv,
  buildCreditCardReconciliationCsv
} from '@/utils/creditCardCsv';

describe('buildCreditCardInvoiceCsv', () => {
  it('exports invoice metadata and item rows as csv', () => {
    const csv = buildCreditCardInvoiceCsv({
      cardName: 'Visa Platinum',
      invoice: {
        referenceYear: 2026,
        referenceMonth: 6,
        closingDate: '2026-06-10',
        dueDate: '2026-06-20',
        totalAmount: '123.45',
        status: 'OPEN',
        itemCount: 1,
        fixedItemCount: 0,
        itemsSubtotal: '123.45',
        fixedSubtotal: '0',
        isProjected: false,
        hasProjectedTransactions: false,
        account: {
          name: 'Cartao Principal'
        },
        transactions: [
          {
            id: 10,
            description: 'Mercado "Central"',
            amount: '123.45',
            installmentNumber: 2,
            totalInstallments: 3,
            date: '2026-06-01',
            dueDate: '2026-06-20',
            isExternalCreditCardSettlement: true,
            category: {
              name: 'Alimentacao'
            }
          }
        ]
      }
    });

    expect(csv).toContain('sep=;');
    expect(csv).toContain('Cartao;Visa Platinum');
    expect(csv).toContain('Referencia;06/2026');
    expect(csv).toContain('Status;Aberta');
    expect(csv).toContain(
      'Descricao;Categoria;Parcela;Valor;Data_compra;Data_vencimento;Lancamento_id;Tipo;Observacoes'
    );
    expect(csv).toContain('"Mercado ""Central"" (2 de 3)";Alimentacao;2/3;123,45;01/06/2026;20/06/2026;10;Historico externo;Liquidada fora do sistema');
  });
});

describe('buildCreditCardReconciliationCsv', () => {
  it('exports preview rows with current draft and match data', () => {
    const csv = buildCreditCardReconciliationCsv({
      cardName: 'Nubank',
      sourceLabel: 'CSV Nubank',
      statusFilterLabel: 'Pendente',
      fileName: 'fatura.csv',
      preview: {
        statement: {
          sourceType: 'NUBANK_CSV',
          fileName: 'fatura.csv',
          dueDate: '2026-06-25',
          totalAmount: '200',
          parsedNetAmount: '195',
          referenceYear: 2026,
          referenceMonth: 6
        },
        summary: {
          totalItems: 1,
          okCount: 0,
          similarCount: 0,
          pendingCount: 1,
          notImportableCount: 0,
          importableCount: 1,
          importableAmount: '50',
          okAmount: '0',
          similarAmount: '0',
          pendingAmount: '50',
          notImportableAmount: '0'
        }
      },
      items: [
        {
          id: 'item-1',
          sequence: 1,
          status: 'PENDING',
          reason: 'NO_MATCH',
          kind: 'PURCHASE',
          direction: 'DEBIT',
          amount: '50',
          signedAmount: '-50',
          purchaseDate: '2026-06-02',
          installmentNumber: 1,
          totalInstallments: 2,
          sourceDescription: 'Padaria; Centro',
          sourceSection: 'PURCHASES',
          cardSuffix: '1234',
          canImport: true,
          nonImportableReason: null,
          categorySuggestion: {
            categoryId: 5,
            categoryName: 'Alimentacao',
            source: 'RULE',
            reason: 'Historico anterior'
          },
          matchedTransactions: [
            {
              matchKey: 'transaction:22',
              matchSource: 'TRANSACTION',
              id: 22,
              fixedTemplateId: null,
              description: 'Padaria Centro',
              amount: '50',
              date: '2026-06-02',
              installmentNumber: 1,
              totalInstallments: 2,
              invoiceReference: '06/2026'
            }
          ]
        }
      ],
      itemDrafts: {
        'item-1': {
          description: 'Padaria Centro',
          categoryId: '5'
        }
      },
      selectedItemIds: ['item-1'],
      categories: [
        {
          id: 5,
          name: 'Alimentacao'
        }
      ],
      targetInvoice: {
        referenceYear: 2026,
        referenceMonth: 6,
        dueDate: '2026-06-25',
        status: 'OPEN',
        isProjected: false
      }
    });

    expect(csv).toContain('Fonte;CSV Nubank');
    expect(csv).toContain('Filtro;Pendente');
    expect(csv).toContain('Fatura_alvo;06/2026 (Aberta)');
    expect(csv).toContain(
      'Selecionado;Item;Status;Motivo;Descricao_fatura;Descricao_a_importar;Categoria_a_importar;Categoria_sugerida;Fonte_sugestao;Valor;Valor_assinado;Data_compra;Parcela;Secao;Tipo_linha;Direcao;Final_cartao;Importavel;Correspondencias;Correspondencias_detalhes;Motivo_nao_importavel;Item_id'
    );
    expect(csv).toContain(
      'Sim;1;Pendente;Ainda nao ha lancamento equivalente no cartao.;"Padaria; Centro";Padaria Centro;Alimentacao;Alimentacao;Regra;50,00;-50,00;02/06/2026;1/2;Compras;PURCHASE;Debito;1234;Sim;1;Lancamento | Padaria Centro | 50,00 | 02/06/2026 | 1/2 | fatura 06/2026 | id 22;;item-1'
    );
  });
});
