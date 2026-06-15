export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  getValue: (row: Row) => CsvValue;
}

interface BuildCsvDocumentOptions<Row> {
  metadataRows?: CsvValue[][];
  columns: CsvColumn<Row>[];
  rows: Row[];
  separator?: string;
}

function normalizeCsvValue(value: CsvValue) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'Sim' : 'Nao';
  }

  return String(value);
}

export function escapeCsvValue(value: CsvValue, separator = ';') {
  let normalizedValue = normalizeCsvValue(value)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  if (normalizedValue.includes('"')) {
    normalizedValue = normalizedValue.replace(/"/g, '""');
  }

  if (
    normalizedValue.includes(separator) ||
    normalizedValue.includes('"') ||
    normalizedValue.includes('\n')
  ) {
    return `"${normalizedValue}"`;
  }

  return normalizedValue;
}

function buildCsvRow(values: CsvValue[], separator = ';') {
  return values.map((value) => escapeCsvValue(value, separator)).join(separator);
}

export function buildCsvDocument<Row>({
  metadataRows = [],
  columns,
  rows,
  separator = ';'
}: BuildCsvDocumentOptions<Row>) {
  const lines: string[] = [`sep=${separator}`];

  if (metadataRows.length > 0) {
    metadataRows.forEach((row) => {
      lines.push(buildCsvRow(row, separator));
    });
    lines.push('');
  }

  lines.push(buildCsvRow(columns.map((column) => column.header), separator));

  rows.forEach((row) => {
    lines.push(buildCsvRow(columns.map((column) => column.getValue(row)), separator));
  });

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function formatCsvAmount(value: string | number | null | undefined) {
  const numericValue = Number(value ?? 0);

  if (!Number.isFinite(numericValue)) {
    return '';
  }

  return numericValue.toFixed(2).replace('.', ',');
}

export function downloadCsvFile(fileName: string, content: string) {
  if (typeof window === 'undefined') {
    return;
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = fileName;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.URL.revokeObjectURL(url);
}
