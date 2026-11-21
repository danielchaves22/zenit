import { parseCreditCardOfx } from '../../src/services/credit-card-ofx-parser';
import { creditCardOfx } from '../fixtures/credit-card-ofx';

const purchase = {
  id: 'purchase-001', date: '20260609235959.000[-3:BRT]', amount: '-59.90', description: 'Café & Pão'
};

describe('credit-card OFX parsing', () => {
  it.each([false, true])('reads complete card transactions using XML=%s and preserves calendar dates', (xml) => {
    const parsed = parseCreditCardOfx(creditCardOfx([purchase], { xml }));
    expect(parsed.endDate).toBe('2026-06-30');
    expect(parsed.transactions).toEqual([expect.objectContaining({
      date: '2026-06-09', amount: '-59.90', description: 'Café & Pão', type: 'DEBIT'
    })]);
    expect(parsed.transactions[0].id).toMatch(/^ofx-[a-f\d]{60}$/);
  });

  it('decodes Windows-1252 files and XML numeric character references', () => {
    const latin1 = Buffer.from(creditCardOfx([purchase]).toString('utf8'), 'latin1');
    expect(parseCreditCardOfx(latin1).transactions[0].description).toBe('Café & Pão');
    const entities = creditCardOfx([purchase], { xml: true }).toString().replace('Café', 'Caf&#233;');
    expect(parseCreditCardOfx(Buffer.from(entities)).transactions[0].description).toBe('Café & Pão');
  });

  it('keeps FITID-based identities when transactions reorder, scoped to the card', () => {
    const other = { ...purchase, id: 'purchase-002' };
    const initial = parseCreditCardOfx(creditCardOfx([purchase, other]));
    const reordered = parseCreditCardOfx(creditCardOfx([other, purchase]));
    const otherCard = parseCreditCardOfx(creditCardOfx([purchase], { accountId: 'other-card' }));
    expect(initial.transactions[0].id).toBe(reordered.transactions[1].id);
    expect(initial.transactions[0].id).not.toBe(initial.transactions[1].id);
    expect(initial.transactions[0].id).not.toBe(otherCard.transactions[0].id);
  });

  it('does not repeat the merchant name already present in the memo', () => {
    const parsed = parseCreditCardOfx(creditCardOfx([{ ...purchase, name: 'Café' }]));
    expect(parsed.transactions[0].description).toBe('Café & Pão');
  });

  it('rejects bank-account statements instead of treating them as credit-card purchases', () => {
    const accountOfx = creditCardOfx([purchase]).toString()
      .replace(/CREDITCARDMSGSRSV1/g, 'BANKMSGSRSV1')
      .replace(/CCSTMTRS/g, 'STMTRS').replace(/CCACCTFROM/g, 'BANKACCTFROM');
    expect(() => parseCreditCardOfx(Buffer.from(accountOfx))).toThrow('extrato de conta');
  });

  it.each<[typeof purchase & { type?: string }, string]>([
    [{ ...purchase, date: '20260230120000' }, 'Data inválida'],
    [{ ...purchase, amount: '-12.345' }, 'Valor monetário inválido'],
    [{ ...purchase, amount: 'NaN' }, 'Valor monetário inválido'],
    [{ ...purchase, amount: '-10000000000000.00' }, 'limite suportado'],
    [{ ...purchase, amount: '59.90', type: 'DEBIT' }, 'Sinal do valor'],
    [{ ...purchase, type: 'CREDIT' }, 'Sinal do valor'],
    [{ ...purchase, description: '' }, 'sem descricao'],
    [{ ...purchase, id: '' }, 'FITID ausente']
  ])('rejects invalid movement fields %#', (row, message) => {
    expect(() => parseCreditCardOfx(creditCardOfx([row]))).toThrow(message);
  });

  it('rejects duplicate FITID values without collapsing legitimate identical purchases with different IDs', () => {
    expect(() => parseCreditCardOfx(creditCardOfx([purchase, purchase]))).toThrow('FITID repetidos');
    expect(parseCreditCardOfx(creditCardOfx([purchase, { ...purchase, id: 'second' }])).transactions).toHaveLength(2);
  });

  it('accepts the OFX FITID limit while keeping the stored item identifier bounded', () => {
    const parsed = parseCreditCardOfx(creditCardOfx([{ ...purchase, id: 'x'.repeat(255) }]));
    expect(parsed.transactions[0].id).toHaveLength(64);
    expect(() => parseCreditCardOfx(creditCardOfx([{ ...purchase, id: 'x'.repeat(256) }]))).toThrow('FITID do OFX excede');
  });

  it('refuses corrections and pending transactions instead of silently importing incomplete financial data', () => {
    const text = creditCardOfx([purchase]).toString();
    const corrected = text.replace('<STMTTRN>', '<STMTTRN><CORRECTFITID>previous-id\n<CORRECTACTION>REPLACE\n');
    const pending = text.replace('</BANKTRANLIST>', '</BANKTRANLIST><BANKTRANLISTP><STMTTRNP><NAME>Pending</STMTTRNP></BANKTRANLISTP>');
    expect(() => parseCreditCardOfx(Buffer.from(corrected))).toThrow('correcoes de lancamentos');
    expect(() => parseCreditCardOfx(Buffer.from(pending))).toThrow('lancamentos pendentes');
  });

  it('rejects truncated transactions and multiple card statements', () => {
    const truncated = creditCardOfx([purchase]).toString().replace('</STMTTRN>', '');
    expect(() => parseCreditCardOfx(Buffer.from(truncated))).toThrow('lancamentos completos');
    const text = creditCardOfx([purchase]).toString();
    expect(() => parseCreditCardOfx(Buffer.from(text + text))).toThrow('unico cartao');
  });

  it('rejects foreign-currency statements and XML entity definitions', () => {
    expect(() => parseCreditCardOfx(creditCardOfx([purchase], { currency: 'USD' }))).toThrow('BRL');
    const declaration = '<!DOCTYPE OFX [<!ENTITY merchant "unexpected">]>';
    expect(() => parseCreditCardOfx(Buffer.concat([Buffer.from(declaration), creditCardOfx([purchase])]))).toThrow('Declaracao XML');
  });
});
