import {
  addFinancialMonths,
  assertFinancialPlanningMonth,
  buildFinancialCalendarContext,
  formatFinancialDateKey,
  formatFinancialMonthKey,
  getFinancialMonthKeyInTimeZone,
  parseFinancialDateKey,
  parseFinancialMonthKey
} from '../../src/utils/financial-calendar';

describe('financial calendar', () => {
  it('represents a month key as the first day at noon UTC', () => {
    expect(parseFinancialMonthKey('2026-09').toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it.each(['2026-9', '2026-00', '2026-13', '26-09', 'invalid'])(
    'rejects the invalid month key %s',
    (monthKey) => {
      expect(() => parseFinancialMonthKey(monthKey)).toThrow(
        'Mês inválido. Use o formato YYYY-MM'
      );
    }
  );

  it('parses and formats date-only financial keys without depending on the host timezone', () => {
    const date = parseFinancialDateKey('2026-01-31');

    expect(date.toISOString()).toBe('2026-01-31T12:00:00.000Z');
    expect(formatFinancialDateKey(date)).toBe('2026-01-31');
  });

  it.each(['2026-1-01', '2026-02-30', '2025-02-29', 'invalid'])(
    'rejects the invalid date key %s',
    (dateKey) => {
      expect(() => parseFinancialDateKey(dateKey)).toThrow(/Data/);
    }
  );

  it('formats and shifts canonical months without depending on the host timezone', () => {
    const january = parseFinancialMonthKey('2026-01');

    expect(formatFinancialMonthKey(january)).toBe('2026-01');
    expect(formatFinancialMonthKey(addFinancialMonths(january, -1))).toBe('2025-12');
    expect(formatFinancialMonthKey(addFinancialMonths(january, 12))).toBe('2027-01');
  });

  it('rejects invalid dates and fractional month shifts', () => {
    expect(() => formatFinancialMonthKey(new Date('invalid'))).toThrow('Data financeira inválida');
    expect(() => addFinancialMonths(parseFinancialMonthKey('2026-01'), 1.5)).toThrow(
      'O deslocamento de meses deve ser um número inteiro'
    );
  });

  it('derives the current financial month from the explicit workspace timezone', () => {
    const instant = new Date('2026-01-01T02:30:00.000Z');

    expect(getFinancialMonthKeyInTimeZone('America/Sao_Paulo', instant)).toBe('2025-12');
    expect(getFinancialMonthKeyInTimeZone('UTC', instant)).toBe('2026-01');
    expect(getFinancialMonthKeyInTimeZone('Asia/Tokyo', instant)).toBe('2026-01');
  });

  it('handles a year boundary that occurs earlier in an eastern timezone', () => {
    const instant = new Date('2026-12-31T23:30:00.000Z');

    expect(getFinancialMonthKeyInTimeZone('Asia/Tokyo', instant)).toBe('2027-01');
    expect(getFinancialMonthKeyInTimeZone('America/Los_Angeles', instant)).toBe('2026-12');
  });

  it('builds one workspace calendar context for the business date and planning horizon', () => {
    const instant = new Date('2026-01-01T02:30:00.000Z');
    const saoPaulo = buildFinancialCalendarContext('America/Sao_Paulo', instant);
    const tokyo = buildFinancialCalendarContext('Asia/Tokyo', instant);

    expect(saoPaulo).toEqual({
      timeZone: 'America/Sao_Paulo',
      businessDate: new Date('2025-12-31T12:00:00.000Z'),
      currentMonthKey: '2025-12',
      maximumPlanningMonthKey: '2027-12'
    });
    expect(tokyo.currentMonthKey).toBe('2026-01');
    expect(tokyo.businessDate.toISOString()).toBe('2026-01-01T12:00:00.000Z');
  });

  it('validates mutable planning months against the workspace calendar', () => {
    const calendar = buildFinancialCalendarContext(
      'America/Sao_Paulo',
      new Date('2026-01-01T02:30:00.000Z')
    );

    expect(
      assertFinancialPlanningMonth('2025-12', calendar, { mutable: true }).toISOString()
    ).toBe('2025-12-01T12:00:00.000Z');
    expect(() =>
      assertFinancialPlanningMonth('2025-11', calendar, { mutable: true })
    ).toThrow('O planejamento não pode alterar meses anteriores');
    expect(() =>
      assertFinancialPlanningMonth('2028-01', calendar, { mutable: false })
    ).toThrow('O planejamento pode ser criado com até 24 meses de antecedência');
  });
});
