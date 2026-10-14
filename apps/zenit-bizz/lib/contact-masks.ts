export type ContactMask = 'cpf' | 'cnpj' | 'phone';
export function normalizeContactValue(value: string, mask: ContactMask) {
  if (mask === 'cpf') return value.replace(/\D/g, '');
  if (mask === 'cnpj') return value.replace(/[^a-z0-9]/gi, '').toUpperCase();
  // Preserve existing international numbers/extensions rather than silently shortening them.
  const digits = value.replace(/\D/g, '');
  if (!/^[+\d\s().-]*$/.test(value)) return value;
  if (value.trim().startsWith('+')) return `+${digits}`;
  return digits;
}
function groups(value: string, sizes: number[], separators: string[]) {
  let result = '',
    offset = 0;
  for (const [index, size] of sizes.entries()) {
    const part = value.slice(offset, offset + size);
    if (part) result += (index ? separators[index - 1] : '') + part;
    offset += size;
  }
  return result;
}
export function formatContactValue(value: string, mask: ContactMask) {
  const raw = normalizeContactValue(value, mask);
  if (mask === 'cpf')
    return raw.length <= 11 ? groups(raw, [3, 3, 3, 2], ['.', '.', '-']) : value;
  if (mask === 'cnpj')
    return raw.length <= 14 ? groups(raw, [2, 3, 3, 4, 2], ['.', '.', '/', '-']) : value;
  const prefix = raw.startsWith('+55') ? '+55 ' : '';
  const number = prefix ? raw.slice(3) : raw;
  if (!/^\d*$/.test(number) || number.length > 11 || (raw.startsWith('+') && !prefix))
    return value;
  if (!number) return prefix.trimEnd();
  const ddd = number.slice(0, 2);
  if (number.length <= 2) return `${prefix}(${ddd}`;
  const local = number.slice(2);
  return `${prefix}(${ddd}) ${groups(local, [local.length > 8 ? 5 : 4, 4], ['-'])}`;
}
