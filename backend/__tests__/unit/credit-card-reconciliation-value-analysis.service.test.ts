import CreditCardReconciliationValueAnalysisService from '../../src/services/credit-card-reconciliation-value-analysis.service';
import type { ReconciliationValueComparison } from '../../src/services/credit-card-statement-reconciliation.service';
import OpenAiIntegrationService from '../../src/services/openai-integration.service';

const comparison: ReconciliationValueComparison = {
  status: 'EXPLAINED',
  file: {
    reportedTotalAmount: null,
    comparableAmount: '5304.58',
    debitAmount: '5304.58',
    creditAmount: '0',
    paymentAmount: '5285.14',
    balanceAmount: '0',
    netAmount: '19.44',
    comparableItemCount: 58,
    creditCount: 0,
    paymentCount: 1
  },
  zenit: { totalAmount: '5304.54', itemCount: 58 },
  differenceAmount: '-0.04',
  absoluteDifferenceAmount: '0.04',
  explainedDifferenceAmount: '-0.04',
  unexplainedDifferenceAmount: '0',
  pairedCount: 58,
  exactAmountCount: 54,
  amountDivergenceCount: 4,
  missingCount: 0,
  extraCount: 0,
  ambiguousCount: 0,
  amountDivergences: [
    {
      itemId: 'item-1',
      sourceDescription: 'Havan Colombo 6/10',
      fileAmount: '18.99',
      zenitAmount: '19',
      differenceAmount: '0.01',
      matchKey: 'transaction:1',
      transactionId: 1,
      transactionDescription: 'Havan Colombo'
    }
  ],
  missingItems: [],
  extraItems: [],
  ambiguousItems: []
};

describe('credit-card reconciliation value analysis service', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
  });

  it('sends only the structured comparison and returns a concise validated opinion', async () => {
    jest.spyOn(OpenAiIntegrationService, 'getDecryptedCredential').mockResolvedValue({
      companyId: 7,
      provider: 'OPENAI',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      promptVersion: 'v1',
      isActive: true,
      updatedAt: new Date('2026-09-10T12:00:00.000Z')
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              headline: 'Diferença totalmente explicada',
              summary: 'Os valores diferem em quatro centavos, todos associados a variações identificadas.',
              findings: ['O pagamento foi separado do total de compras.']
            })
          }
        }]
      })
    }) as jest.Mock;

    const result = await CreditCardReconciliationValueAnalysisService.analyze({
      companyId: 7,
      comparison
    });

    expect(result).toMatchObject({
      headline: 'Diferença totalmente explicada',
      model: 'gpt-4o-mini'
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const userPayload = JSON.parse(body.messages[1].content);
    expect(userPayload).toMatchObject({
      status: 'EXPLAINED',
      differenceAmount: '-0.04',
      counts: { paired: 58, amountDivergence: 4 }
    });
    expect(userPayload).not.toHaveProperty('fileBase64');
    expect(userPayload).not.toHaveProperty('rawFile');
  });

  it('does not call OpenAI when the company integration is unavailable', async () => {
    jest.spyOn(OpenAiIntegrationService, 'getDecryptedCredential').mockRejectedValue(
      new Error('not configured')
    );
    global.fetch = jest.fn() as jest.Mock;

    await expect(
      CreditCardReconciliationValueAnalysisService.analyze({ companyId: 7, comparison })
    ).rejects.toMatchObject({
      code: 'AI_NOT_CONFIGURED',
      statusCode: 503
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
