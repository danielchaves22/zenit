export function nubankCsv(rows: Array<[string, string, string, string]>) {
  return Buffer.from('Data,Valor,Identificador,Descrição\n' + rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n'));
}
export function ofx(bank: number, rows: Array<{ date: string; amount: string; id: string; description: string; document?: string }>, account = '12345') {
  return Buffer.from(`OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>${bank}<ACCTID>${account}</BANKACCTFROM><BANKTRANLIST><DTSTART>20260801000000<DTEND>20260831000000` + rows.map(r =>
    `<STMTTRN><TRNTYPE>${r.amount.startsWith('-') ? 'DEBIT' : 'CREDIT'}<DTPOSTED>${r.date.replace(/-/g, '')}120000[-3:BRT]<TRNAMT>${r.amount}<FITID>${r.id}${r.document ? '<CHECKNUM>' + r.document : ''}<MEMO>${r.description}</STMTTRN>`
  ).join('') + '</BANKTRANLIST><LEDGERBAL><BALAMT>99.90<DTASOF>20260831</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
}
export const bradescoCsv = Buffer.from([
  'Extrato de: Ag: 69 | Conta: 12345-2 | Entre 01/08/2026 e 31/08/2026',
  'Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$);',
  '31/07/26;SALDO ANTERIOR;;;;"100,00";',
  '03/08/26; Pix Enviado;000001;;"-46,64";"53,36";',
  ';Des: Padaria Exemplo;;',
  '04/08/26; Rent.inv.facil;000002;"0,01";;"53,37";',
  ';Total;;"0,01";"-46,64";"53,37"',
  'Os dados acima têm como base 06/09/2026 às 22h12 e estão sujeitos a alterações.',
  '', 'Últimos Lançamentos', 'Data;Histórico;Docto.;Crédito (R$);Débito (R$);',
  '04/09/26; Tarifa;000001;;"-1,00";',
  ';Total;;"0,00";"-1,00"', '', 'Saldos Invest Fácil',
  'Data;Histórico;Saldo (R$);', '03/08/26;Saldo;"53,36";', '04/08/26;Saldo;"53,37";'
].join('\r'), 'latin1');
export const bradescoOfx = ofx(237, [
  { date: '2026-08-03', amount: '-46.64', id: 'br-1', document: '000001', description: 'Pix Enviado Des: Padaria Exemplo' },
  { date: '2026-08-04', amount: '0.01', id: 'br-2', document: '000002', description: 'Rent.inv.facil' },
  { date: '2026-09-04', amount: '-1.00', id: 'br-3', document: '000001', description: 'Tarifa' }
], '69/12345');
