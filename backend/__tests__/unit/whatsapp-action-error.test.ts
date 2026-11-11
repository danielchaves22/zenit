import { formatWhatsAppActionError } from '../../src/utils/whatsapp-action-error';

describe('WhatsApp Cash validation errors', () => {
  it('uses the balance from the failed validation, even when no draft summary is available', () => {
    const text = formatWhatsAppActionError(new Error('Insufficient balance for transfer. Available: -25.10, Required: 2000.00'));
    expect(text).toContain('Saldo insuficiente na conta de origem.');
    expect(text).toContain('Disponível: -R$ 25,10.');
    expect(text).toContain('Valor do lançamento: R$ 2.000,00.');
    expect(text).toContain('Nenhum lançamento foi gravado. O rascunho foi mantido.');
  });

  it.each([
    ['Categoria financeira incompativel com o tipo da transacao', 'categoria selecionada não é compatível'],
    ['Usuario sem acesso a conta de origem da acao pendente', 'Você não tem acesso à conta de origem'],
    ['Account 17 is inactive', 'conta selecionada não está mais disponível'],
    ['Account 17 does not belong to company 2', 'conta selecionada não pertence a esta área'],
    ['Acao pendente nao pode mais ser confirmada', 'já foi confirmado ou cancelado'],
    ['Another transaction is using one of these accounts. Please try again.', 'conta está sendo atualizada por outra operação']
  ])('explains the application validation: %s', (error, expected) => {
    expect(formatWhatsAppActionError(new Error(error))).toContain(expected);
  });

  it('explains a closed invoice without asking the user to falsify the purchase date', () => {
    const err = new Error('A data informada direciona esta compra para uma fatura ja fechada. Escolha a fatura aberta atual ou altere a data da compra.');
    const result = formatWhatsAppActionError(err, { description: 'Compra', amount: 99, date: '2026-11-10',
      type: 'EXPENSE', status: 'COMPLETED' });
    expect(result).toContain('A compra de 10/11/2026 cai em uma fatura já fechada');
    expect(result).toContain('Nenhum lançamento foi gravado');
    expect(result).toContain('no Cash e escolha a fatura aberta');
    expect(formatWhatsAppActionError(err)).toContain('Esta compra cai em uma fatura já fechada');
  });

  it('preserves the exact public message already emitted in Portuguese by Cash', () => {
    const message = 'Cartão de crédito sem fechamento e vencimento configurados';
    expect(formatWhatsAppActionError(new Error(message))).toBe(message);
  });

  it.each([
    new Error('Invalid prisma query: postgres://private-credentials@host/database'),
    new Error('Insufficient balance. Available: 1.00, Required: 2.00\nprivate SQL details'),
    { message: 'private provider response' },
    null
  ])('does not forward internal error details or claim the draft is stale', (error) => {
    const text = formatWhatsAppActionError(error);
    expect(text).toContain('falha interna');
    expect(text).not.toMatch(/private|postgres|prisma|desatualizado|mantido|gravado/);
  });
});
