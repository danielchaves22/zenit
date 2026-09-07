import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';

export type BankSource = 'NUBANK' | 'BRADESCO';
export interface BankMovement {
  date: string;
  amount: string;
  description: string;
  normalizedDescription: string;
  externalId: string | null;
  document: string | null;
  identityKey: string;
}
export interface BankStatement {
  bank: BankSource;
  format: 'CSV' | 'OFX';
  accountNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  openingBalance: string | null;
  closingBalance: string | null;
  balanceDate: string | null;
  movements: BankMovement[];
  warnings: string[];
}

export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const normalizeDescription = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

export function calendarDate(value: string): string {
  let iso: string;
  if (/^\d{2}\/\d{2}\/(?:\d{2}|\d{4})$/.test(value)) {
    const [d, m, y] = value.split('/');
    iso = `${y.length === 2 ? '20' + y : y}-${m}-${d}`;
  } else if (/^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.test(value)) {
    iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  } else {
    iso = value;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso)) ||
      new Date(iso).toISOString().slice(0, 10) !== iso || iso < '2000-01-01' || iso > '2200-12-31') {
    throw new Error(`Data inválida no extrato: ${value}`);
  }
  return iso;
}

export function statementMoney(value: string, brazilian = false): string {
  const text = value.trim().replace(/\s/g, '');
  const normalized = brazilian ? text.replace(/\./g, '').replace(',', '.') : text;
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Valor monetário inválido no extrato.');
  const amount = new Prisma.Decimal(normalized);
  if (amount.abs().gte('10000000000000')) throw new Error('Valor do extrato excede o limite suportado.');
  return amount.toFixed(2);
}

// A small RFC 4180 reader supports quoted descriptions, separators and line breaks.
export function readDelimited(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || !field.trim()) quoted = !quoted;
      else field += c;
    } else if (!quoted && (c === separator || c === '\n' || c === '\r')) {
      row.push(field.trim()); field = '';
      if (c === '\n' || c === '\r') { rows.push(row); row = []; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else field += c;
  }
  if (quoted) throw new Error('CSV com aspas não fechadas.');
  if (field || row.length) { row.push(field.trim()); rows.push(row); }
  return rows;
}

function decode(buffer: Buffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buffer); }
}
const unescapeXml = (s: string) => s.replace(/&(?:amp|lt|gt|quot|apos);/g,
  (entity) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }[entity]!));
const tag = (text: string, name: string) => {
  const value = text.match(new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i'))?.[1]?.trim();
  return value ? unescapeXml(value) : null;
};
type RawMovement = Omit<BankMovement, 'identityKey' | 'normalizedDescription'>;

export function parseBankStatement(buffer: Buffer): BankStatement {
  if (!buffer.length || buffer.length > 5_000_000) throw new Error('Selecione um extrato de até 5 MB.');
  const text = decode(buffer);
  const raw: RawMovement[] = [];
  const result: BankStatement = {
    bank: 'NUBANK', format: 'CSV', accountNumber: null, startDate: null, endDate: null,
    openingBalance: null, closingBalance: null, balanceDate: null, movements: [], warnings: []
  };
  if (/<OFX>/i.test(text)) {
    result.format = 'OFX';
    if ((text.match(/<BANKTRANLIST>/gi) || []).length !== 1) throw new Error('O OFX deve conter o extrato de uma única conta.');
    const bankCode = Number(tag(text, 'BANKID'));
    if (bankCode !== 260 && bankCode !== 237) throw new Error('OFX suportado para contas Nubank e Bradesco.');
    result.bank = bankCode === 260 ? 'NUBANK' : 'BRADESCO';
    result.accountNumber = tag(text, 'ACCTID');
    result.startDate = tag(text, 'DTSTART') ? calendarDate(tag(text, 'DTSTART')!) : null;
    result.endDate = tag(text, 'DTEND') ? calendarDate(tag(text, 'DTEND')!) : null;
    const ledger = text.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|$)/i)?.[1];
    if (ledger) {
      result.closingBalance = tag(ledger, 'BALAMT') ? statementMoney(tag(ledger, 'BALAMT')!) : null;
      result.balanceDate = tag(ledger, 'DTASOF') ? calendarDate(tag(ledger, 'DTASOF')!) : null;
    }
    const chunks = [...text.matchAll(/<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/STMTTRN>|<\/BANKTRANLIST>)/gi)];
    for (const [, chunk] of chunks) {
      const date = tag(chunk, 'DTPOSTED'), amount = tag(chunk, 'TRNAMT');
      const description = [tag(chunk, 'NAME'), tag(chunk, 'MEMO')].filter(Boolean).join(' ');
      if (!date || !amount || !description) throw new Error('Movimento OFX sem data, valor ou descrição.');
      raw.push({ date: calendarDate(date), amount: statementMoney(amount), description,
        externalId: tag(chunk, 'FITID'), document: tag(chunk, 'CHECKNUM') });
    }
  } else if (/^Data,Valor,Identificador,Descri/m.test(text)) {
    const rows = readDelimited(text, ',');
    for (const row of rows.slice(1).filter(r => r.some(Boolean))) {
      if (row.length !== 4 || !row[2] || !row[3]) throw new Error('Linha inválida no CSV Nubank.');
      raw.push({ date: calendarDate(row[0]), amount: statementMoney(row[1]), externalId: row[2], description: row[3], document: null });
    }
  } else if (/Data;Hist[oó]rico;Docto\./i.test(text)) {
    result.bank = 'BRADESCO';
    const rows = readDelimited(text, ';');
    const header = rows.findIndex(r => r[0] === 'Data' && normalizeDescription(r[1] || '') === 'HISTORICO');
    const metadata = rows.slice(0, header).flat().join(' ');
    result.accountNumber = metadata.match(/conta\s*[: ]\s*([\d-]+)/i)?.[1] || null;
    const period = metadata.match(/(\d{2}\/\d{2}\/\d{4}).*?(\d{2}\/\d{2}\/\d{4})/);
    if (period) { result.startDate = calendarDate(period[1]); result.endDate = calendarDate(period[2]); }
    let last: RawMovement | null = null, recent = false;
    for (const row of rows.slice(header + 1)) {
      const label = normalizeDescription(row.join(' '));
      if (label.includes('SALDOS INVEST FACIL')) break;
      if (label.startsWith('OS DADOS ACIMA TEM COMO BASE') && !row.slice(1).some(Boolean)) { last = null; continue; }
      if (label.includes('ULTIMOS LANCAMENTOS')) { recent = true; last = null; continue; }
      if (!row.some(Boolean) || row[0] === 'Data') { last = null; continue; }
      if (label.includes('SALDO ANTERIOR')) {
        if (!recent && row[5]) result.openingBalance = statementMoney(row[5], true);
        last = null; continue;
      }
      if (normalizeDescription(row[0]) === 'TOTAL' || (!row[0] && normalizeDescription(row[1] || '') === 'TOTAL')) {
        if (!recent && row[5]) result.closingBalance = statementMoney(row[5], true);
        last = null; continue;
      }
      if (!row[0]) {
        if (last && row[1] && !row.slice(2).some(Boolean)) last.description += ` ${row[1]}`;
        else if (row.slice(2).some(Boolean)) throw new Error('Linha monetária sem data no CSV Bradesco.');
        continue;
      }
      if (!/^\d{2}\/\d{2}\/(?:\d{2}|\d{4})$/.test(row[0])) throw new Error('Linha desconhecida no CSV Bradesco.');
      const credit = row[3] ? new Prisma.Decimal(statementMoney(row[3], true)) : new Prisma.Decimal(0);
      const debit = row[4] ? new Prisma.Decimal(statementMoney(row[4], true)).abs() : new Prisma.Decimal(0);
      if (credit.isNegative() || (!credit.isZero() && !debit.isZero()) || !row[1]) throw new Error('Crédito/débito inválido no CSV Bradesco.');
      last = { date: calendarDate(row[0]), amount: credit.minus(debit).toFixed(2), description: row[1], document: row[2] || null, externalId: null };
      raw.push(last);
    }
    result.balanceDate = result.endDate;
  } else throw new Error('Formato não reconhecido. Use o extrato da conta Nubank ou Bradesco em OFX ou CSV.');

  if (!raw.length || raw.length > 5000) throw new Error('O extrato deve conter entre 1 e 5.000 movimentos.');
  const nativeIds = new Set<string>(), occurrences = new Map<string, number>();
  for (const movement of raw) {
    if (movement.description.length > 2000 || (movement.externalId?.length || 0) > 150 || (movement.document?.length || 0) > 150) throw new Error('Um movimento do extrato contém campos maiores que o limite suportado.');
    if (new Prisma.Decimal(movement.amount).isZero()) throw new Error('Movimento com valor zero: revise o extrato.');
    if (movement.externalId) {
      if (nativeIds.has(movement.externalId)) throw new Error('O extrato contém identificadores bancários repetidos.');
      nativeIds.add(movement.externalId);
    }
    const normalizedDescription = normalizeDescription(movement.description);
    const signature = hash(JSON.stringify([movement.date, movement.amount, movement.document?.replace(/^0+(?=\d)/, '') || null, normalizedDescription]));
    const occurrence = (occurrences.get(signature) || 0) + 1;
    occurrences.set(signature, occurrence);
    result.movements.push({ ...movement, normalizedDescription,
      identityKey: result.bank === 'NUBANK' && movement.externalId
        ? `NUBANK:${movement.externalId}` : `${result.bank}:${signature}:${occurrence}` });
  }
  if ([...occurrences.values()].some(n => n > 1)) result.warnings.push('Há movimentos idênticos no extrato. Eles foram preservados individualmente; confira antes de confirmar vínculos.');
  return result;
}
