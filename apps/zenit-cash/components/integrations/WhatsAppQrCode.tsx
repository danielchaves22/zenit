import React from 'react';
import { toQR } from 'toqr';

interface WhatsAppQrCodeProps {
  size?: number;
  value: string;
}

export function WhatsAppQrCode({ value, size = 240 }: WhatsAppQrCodeProps) {
  const matrix = toQR(value);
  const dimension = Math.sqrt(matrix.length);

  if (!Number.isInteger(dimension)) {
    return null;
  }

  const cells: string[] = [];
  for (let y = 0; y < dimension; y += 1) {
    for (let x = 0; x < dimension; x += 1) {
      if (matrix[y * dimension + x]) {
        cells.push(`M${x},${y}h1v1h-1z`);
      }
    }
  }

  return (
    <svg
      aria-label="QR Code para conectar WhatsApp"
      className="rounded-xl bg-white p-3"
      height={size}
      role="img"
      viewBox={`0 0 ${dimension} ${dimension}`}
      width={size}
    >
      <rect fill="#ffffff" height={dimension} width={dimension} x={0} y={0} />
      <path d={cells.join('')} fill="#111827" />
    </svg>
  );
}
