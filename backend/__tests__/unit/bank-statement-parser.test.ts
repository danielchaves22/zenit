import { calendarDate, parseBankStatement, readDelimited, statementMoney } from '../../src/services/bank-statement-parser';
import { bradescoCsv, bradescoOfx, nubankCsv, ofx } from '../fixtures/bank-statements';

describe('Bank statement normalization', () => {
  it('normalizes Nubank OFX and quoted CSV to the same identities without losing commas', () => {
    const a = parseBankStatement(nubankCsv([['03/08/2026', '-38.34', 'uuid-1', 'Mercado, pão'], ['03/08/2026', '-8.30', 'uuid-2', 'Padaria']]));
    const b = parseBankStatement(ofx(260, [{ date: '2026-08-03', amount: '-38.34', id: 'uuid-1', description: 'Mercado, pão' }, { date: '2026-08-03', amount: '-8.30', id: 'uuid-2', description: 'Padaria' }]));
    expect(a.movements.map(i => i.identityKey)).toEqual(b.movements.map(i => i.identityKey));
    expect(a.movements[0].description).toBe('Mercado, pão');
  });
  it('reads Bradesco CP1252, CR line breaks, two-digit years and continuation lines', () => {
    const statement = parseBankStatement(bradescoCsv);
    expect(statement.movements).toHaveLength(3);
    expect(statement.movements.filter(i => i.date.startsWith('2026-08'))).toHaveLength(2);
    expect(statement.movements[0].description).toBe('Pix Enviado Des: Padaria Exemplo');
    expect(statement.openingBalance).toBe('100.00');
    expect(statement.closingBalance).toBe('53.37');
    expect(statement.accountNumber).toBe('12345-2');
    expect(statement.movements.map(i => i.identityKey)).toEqual(parseBankStatement(bradescoOfx).movements.map(i => i.identityKey));
  });
  it('keeps distinct same-value transactions and flags indistinguishable rows', () => {
    const statement = parseBankStatement(ofx(237, [1, 2].map(i => ({ date: '2026-08-03', amount: '-10.00', id: `native-${i}`, document: '1', description: 'Pix' }))));
    expect(statement.movements).toHaveLength(2);
    expect(new Set(statement.movements.map(i => i.identityKey)).size).toBe(2);
    expect(statement.warnings).toHaveLength(1);
  });
  it('rejects repeated native identifiers, invalid dates and unsupported banks', () => {
    expect(() => parseBankStatement(nubankCsv([['03/08/2026', '-1.00', 'id', 'A'], ['03/08/2026', '-1.00', 'id', 'B']]))).toThrow('identificadores');
    expect(() => calendarDate('31/02/2026')).toThrow('Data inválida');
    expect(() => parseBankStatement(ofx(999, [{ date: '2026-08-03', amount: '1.00', id: '1', description: 'A' }]))).toThrow('suportado');
    expect(() => statementMoney('1.234')).toThrow('monetário');
  });
  it('handles CRLF and quoted line breaks without shifting columns', () => {
    expect(readDelimited('a;b\r\n"c\r\nd";"e;f"\r\n', ';')).toEqual([['a', 'b'], ['c\r\nd', 'e;f']]);
    expect(() => readDelimited('"unclosed', ',')).toThrow('aspas');
  });
});
