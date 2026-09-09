import financialRouter from '../../src/routes/financial.routes';
import {
  commitCreditCardReconciliation,
  commitCreditCardReconciliationSession
} from '../../src/controllers/credit-card-reconciliation.controller';
import CreditCardStatementReconciliationService, {
  CreditCardReconciliationItemCommitError
} from '../../src/services/credit-card-statement-reconciliation.service';
import CreditCardReconciliationSessionService from '../../src/services/credit-card-reconciliation-session.service';

function validationMiddleware(path: string, method: 'get' | 'post') {
  const layer = (financialRouter as any).stack.find(
    (entry: any) => entry.route?.path === path && entry.route.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} not found`);
  }

  const routeStack = layer.route.stack;
  return routeStack[routeStack.length - 2].handle as Function;
}

function responseDouble() {
  const response: any = {
    status: jest.fn(() => response),
    json: jest.fn(() => response)
  };
  return response;
}

describe('credit-card reconciliation session route validation boundaries', () => {
  it('blocks the mutable legacy commit endpoint', async () => {
    const commitSpy = jest.spyOn(CreditCardStatementReconciliationService, 'commit');
    const response = responseDouble();

    await commitCreditCardReconciliation({} as any, response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PERSISTED_RECONCILIATION_SESSION_REQUIRED'
    }));
    expect(commitSpy).not.toHaveBeenCalled();
    commitSpy.mockRestore();
  });

  it('returns the actionable item identity when an atomic item creation fails', async () => {
    const error = new CreditCardReconciliationItemCommitError(
      'item-0042',
      'Falha ao processar "Notebook": a fatura futura esta liquidada'
    );
    const commitSpy = jest.spyOn(
      CreditCardReconciliationSessionService,
      'commit'
    ).mockRejectedValueOnce(error);
    const response = responseDouble();
    const req: any = {
      user: { companyId: 1, userId: 2 },
      params: { accountId: '3', sessionId: '4' },
      body: { expectedRevision: 1, selectedItems: [] }
    };

    try {
      await commitCreditCardReconciliationSession(req, response);

      expect(response.status).toHaveBeenCalledWith(400);
      expect(response.json).toHaveBeenCalledWith({
        error: error.message,
        code: 'ITEM_COMMIT_FAILED',
        itemId: 'item-0042'
      });
    } finally {
      commitSpy.mockRestore();
    }
  });

  it('takes accountId from the authorized POST path and ignores query overrides', () => {
    const validate = validationMiddleware(
      '/credit-cards/:accountId/reconciliation/sessions',
      'post'
    );
    const req: any = {
      method: 'POST',
      params: { accountId: '12' },
      query: { accountId: '999' },
      body: {
        accountId: '888',
        sourceType: 'NUBANK_CSV',
        targetReferenceYear: 2026,
        targetReferenceMonth: 8,
        fileBase64: 'YQ==',
        fileName: 'invoice.csv'
      }
    };
    const next = jest.fn();

    validate(req, responseDouble(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.params.accountId).toBe(12);
    expect(req.body.accountId).toBeUndefined();
    expect(req.query.accountId).toBe('999');
  });

  it('validates resume identifiers only from GET path params', () => {
    const validate = validationMiddleware(
      '/credit-cards/:accountId/reconciliation/sessions/:referenceYear/:referenceMonth',
      'get'
    );
    const req: any = {
      method: 'GET',
      params: {
        accountId: '12',
        referenceYear: '2026',
        referenceMonth: '8'
      },
      query: {
        accountId: '999',
        referenceYear: '2099',
        referenceMonth: '1'
      },
      body: {}
    };
    const next = jest.fn();

    validate(req, responseDouble(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.params).toEqual({ accountId: 12, referenceYear: 2026, referenceMonth: 8 });
    expect(req.query).toEqual({ accountId: '999', referenceYear: '2099', referenceMonth: '1' });
  });
});
