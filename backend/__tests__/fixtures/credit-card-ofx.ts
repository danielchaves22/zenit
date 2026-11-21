// Synthetic fixtures based on the OFX credit-card structure, not a customer's statement.
export function creditCardOfx(
  rows: Array<{ id: string; date: string; amount: string; description: string; type?: string; name?: string }>,
  options: { xml?: boolean; accountId?: string; currency?: string; endDate?: string } = {}
) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tag = (name: string, value: string) => `<${name}>${escape(value)}${options.xml ? `</${name}>` : '\n'}`;
  const header = options.xml
    ? '<?xml version="1.0" encoding="UTF-8"?>\n<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n'
    : 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:UTF-8\nCHARSET:NONE\n\n';
  return Buffer.from(`${header}<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
${tag('CURDEF', options.currency || 'BRL')}
<CCACCTFROM>${tag('ACCTID', options.accountId || 'synthetic-card-1234')}</CCACCTFROM>
<BANKTRANLIST>${tag('DTSTART', '20260601000000[-3:BRT]')}${tag('DTEND', options.endDate || '20260630120000[-3:BRT]')}
${rows.map((row) => `<STMTTRN>${tag('TRNTYPE', row.type || (row.amount.startsWith('-') ? 'DEBIT' : 'CREDIT'))}${tag('DTPOSTED', row.date)}${tag('TRNAMT', row.amount)}${tag('FITID', row.id)}${row.name ? tag('NAME', row.name) : ''}${tag('MEMO', row.description)}</STMTTRN>`).join('\n')}
</BANKTRANLIST><LEDGERBAL>${tag('BALAMT', '-9999.99')}${tag('DTASOF', '20260630120000[-3:BRT]')}</LEDGERBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`);
}
