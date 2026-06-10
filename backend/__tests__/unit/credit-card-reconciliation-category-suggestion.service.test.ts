import { __private__ } from '../../src/services/credit-card-reconciliation-category-suggestion.service';

const categories = [
  {
    id: 1,
    name: 'Tarifas Bancarias',
    color: '#f59e0b',
    icon: 'wallet',
    parentId: null,
    isDefault: false,
    parent: null
  },
  {
    id: 2,
    name: 'Farmacia',
    color: '#22c55e',
    icon: 'pill',
    parentId: 3,
    isDefault: false,
    parent: {
      id: 3,
      name: 'Saude'
    }
  }
];

describe('Credit card reconciliation category suggestion service', () => {
  it('suggests a fee-like category for annuity and taxes by rule', () => {
    const annuitySuggestion = __private__.suggestByRule(
      {
        id: 'item-1',
        kind: 'ANNUITY',
        amount: '69',
        installmentNumber: 4,
        totalInstallments: 12,
        sourceDescription: 'ANUIDADE DIFERENCIADA TIT',
        sourceSection: 'ANNUITY',
        canImport: true
      },
      categories
    );

    const taxSuggestion = __private__.suggestByRule(
      {
        id: 'item-2',
        kind: 'TAX',
        amount: '1.14',
        installmentNumber: null,
        totalInstallments: null,
        sourceDescription: 'IOF BASE DE ROTATIVO',
        sourceSection: 'OTHER',
        canImport: true
      },
      categories
    );

    expect(annuitySuggestion?.categoryId).toBe(1);
    expect(annuitySuggestion?.source).toBe('RULE');
    expect(taxSuggestion?.categoryId).toBe(1);
    expect(taxSuggestion?.source).toBe('RULE');
  });

  it('extracts source description from legacy notes', () => {
    const extractedDescription = __private__.extractStatementDescriptionFromNotes(
      'Importado por conciliacao de cartao (CAIXA_PDF) - item caixa-1 - descricao original: PANVEL FARMACIAS FL 56'
    );

    expect(extractedDescription).toBe('PANVEL FARMACIAS FL 56');
  });

  it('uses persisted import source description in history suggestions', () => {
    const suggestion = __private__.suggestByHistory(
      {
        id: 'item-3',
        kind: 'PURCHASE',
        amount: '35.48',
        installmentNumber: null,
        totalInstallments: null,
        sourceDescription: 'PANVEL FARMACIAS FL 56',
        sourceSection: 'PURCHASES',
        canImport: true
      },
      [
        {
          id: 99,
          description: 'Remedios e perfumaria',
          notes: null,
          importSourceDescription: 'PANVEL FARMACIAS FL 56',
          date: new Date('2026-05-07T12:00:00.000Z'),
          category: categories[1]
        }
      ]
    );

    expect(suggestion?.categoryId).toBe(2);
    expect(suggestion?.source).toBe('HISTORY');
  });

  it('falls back to legacy notes when the persisted import source description is absent', () => {
    const suggestion = __private__.suggestByHistory(
      {
        id: 'item-4',
        kind: 'PURCHASE',
        amount: '35.48',
        installmentNumber: null,
        totalInstallments: null,
        sourceDescription: 'PANVEL FARMACIAS FL 56',
        sourceSection: 'PURCHASES',
        canImport: true
      },
      [
        {
          id: 100,
          description: 'Remedios e perfumaria',
          notes:
            'Importado por conciliacao de cartao (CAIXA_PDF) - item caixa-1 - descricao original: PANVEL FARMACIAS FL 56',
          importSourceDescription: null,
          date: new Date('2026-05-07T12:00:00.000Z'),
          category: categories[1]
        }
      ]
    );

    expect(suggestion?.categoryId).toBe(2);
    expect(suggestion?.source).toBe('HISTORY');
  });
});
