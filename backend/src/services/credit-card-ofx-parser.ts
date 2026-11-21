import { createHash } from 'crypto';
import { calendarDate, statementMoney } from './bank-statement-parser';

export interface CreditCardOfxTransaction {
  id: string;
  date: string;
  amount: string;
  description: string;
  type: string;
  raw: string;
}

export interface CreditCardOfxStatement {
  endDate: string | null;
  transactions: CreditCardOfxTransaction[];
}

function decodeOfx(buffer: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function decodeEntities(value: string) {
  const entities: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"
  };

  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
    const hexadecimal = entity[1].toLowerCase() === 'x';
    const codePoint = parseInt(entity.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw new Error('Entidade de texto invalida no OFX do cartao');
    }
    return String.fromCodePoint(codePoint);
  });
}

// OFX 1.x omits closing tags for scalar values, but closes aggregate elements.
// Reading scalar text directly also accepts the explicit leaf tags in OFX 2.x.
function leaf(text: string, name: string, required = false): string | null {
  const values = [...text.matchAll(new RegExp(
    `<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))`, 'gi'
  ))];
  if (values.length > 1) throw new Error(`Campo ${name} repetido no OFX do cartao`);
  const match = values[0];
  const value = match
    ? (match[1] !== undefined ? match[1] : decodeEntities(match[2])).trim()
    : null;
  if (required && !value) throw new Error(`Campo ${name} ausente no OFX do cartao`);
  return value || null;
}

function aggregate(text: string, name: string): string {
  const openings = text.match(new RegExp(`<${name}>`, 'gi')) || [];
  const values = [...text.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'gi'))];
  if (openings.length !== 1 || values.length !== 1) {
    throw new Error(`Estrutura ${name} invalida: selecione o OFX de um unico cartao`);
  }
  return values[0][1];
}

export function parseCreditCardOfx(buffer: Buffer): CreditCardOfxStatement {
  if (!buffer.length || buffer.length > 5_000_000) {
    throw new Error('Selecione uma fatura OFX de ate 5 MB');
  }

  const text = decodeOfx(buffer).replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('Declaracao XML nao suportada no OFX');
  if (!/<OFX>/i.test(text) || !/<\/OFX>/i.test(text)) {
    throw new Error('Arquivo OFX do cartao vazio ou incompleto');
  }
  if (/<(?:BANKMSGSRSV1|BANKACCTFROM|STMTRS)>/i.test(text)) {
    throw new Error('O arquivo e um extrato de conta. Selecione o OFX da fatura do cartao Nubank');
  }

  const statement = aggregate(text, 'CCSTMTRS');
  if (/<STMTTRNP>/i.test(statement)) {
    throw new Error('OFX com lancamentos pendentes nao suportado. Exporte os lancamentos confirmados do cartao');
  }
  const account = aggregate(statement, 'CCACCTFROM');
  const accountId = leaf(account, 'ACCTID', true)!;
  if (accountId.length > 150) throw new Error('Identificacao do cartao excede o limite suportado');
  if (leaf(statement, 'CURDEF', true)?.toUpperCase() !== 'BRL') {
    throw new Error('A fatura OFX deve informar valores em BRL');
  }
  const transactionList = aggregate(statement, 'BANKTRANLIST');
  const startDate = leaf(transactionList, 'DTSTART');
  const endDate = leaf(transactionList, 'DTEND');
  if (startDate) calendarDate(startDate);
  const normalizedEndDate = endDate ? calendarDate(endDate) : null;
  const chunks = [...transactionList.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
  const openingCount = (transactionList.match(/<STMTTRN>/gi) || []).length;
  if (!chunks.length || chunks.length > 5000 || openingCount !== chunks.length) {
    throw new Error('O OFX do cartao deve conter de 1 a 5.000 lancamentos completos');
  }

  const ids = new Set<string>();
  const transactions = chunks.map(([, raw]) => {
    if (/<(?:CORRECTFITID|CORRECTACTION)>/i.test(raw)) {
      throw new Error('OFX com correcoes de lancamentos nao suportado. Revise a fatura antes de importar');
    }
    const fitId = leaf(raw, 'FITID', true)!;
    if (fitId.length > 255) throw new Error('FITID do OFX excede o limite suportado');
    if (ids.has(fitId)) throw new Error('A fatura OFX contem identificadores FITID repetidos');
    ids.add(fitId);

    const name = leaf(raw, 'NAME');
    const memo = leaf(raw, 'MEMO');
    const description = (memo && (!name || memo.toLowerCase().startsWith(name.toLowerCase()))
      ? memo
      : [name, memo].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim();
    if (!description || description.length > 2000) {
      throw new Error('Lancamento OFX sem descricao ou com descricao maior que o limite');
    }

    const date = calendarDate(leaf(raw, 'DTPOSTED', true)!);
    const amount = statementMoney(leaf(raw, 'TRNAMT', true)!);
    const type = leaf(raw, 'TRNTYPE', true)!.toUpperCase();
    const isNegative = amount.startsWith('-');
    if ((type === 'DEBIT' && !isNegative && amount !== '0.00') || (type === 'CREDIT' && isNegative)) {
      throw new Error('Sinal do valor incompativel com o tipo de lancamento OFX');
    }

    return {
      id: `ofx-${createHash('sha256').update(JSON.stringify([accountId, fitId])).digest('hex').slice(0, 60)}`,
      date,
      amount,
      description,
      type,
      raw: `<STMTTRN>${raw}</STMTTRN>`
    };
  });

  return { endDate: normalizedEndDate, transactions };
}
