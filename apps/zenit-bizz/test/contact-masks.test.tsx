import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { formatContactValue } from '@/lib/contact-masks';
import { MaskedContactInput } from '@/components/MaskedContactInput';

describe('contact masks', () => {
  it('formats CPF, numeric and alphanumeric CNPJ, fixed and mobile numbers', () => {
    expect(formatContactValue('12345678901', 'cpf')).toBe('123.456.789-01');
    expect(formatContactValue('12345678000190', 'cnpj')).toBe('12.345.678/0001-90');
    expect(formatContactValue('00000000e08g12', 'cnpj')).toBe('00.000.000/E08G-12');
    expect(formatContactValue('1134567890', 'phone')).toBe('(11) 3456-7890');
    expect(formatContactValue('11912345678', 'phone')).toBe('(11) 91234-5678');
    expect(formatContactValue('+5511912345678', 'phone')).toBe('+55 (11) 91234-5678');
    expect(formatContactValue('+1 202 555 0123', 'phone')).toBe('+1 202 555 0123');
    expect(formatContactValue('1134567890 ramal 42', 'phone')).toBe('1134567890 ramal 42');
  });
  it('keeps the caret at the edit and allows deleting across separators', () => {
    function Field() {
      const [value, setValue] = useState('12345678901');
      return (
        <MaskedContactInput aria-label="CPF" mask="cpf" value={value} onChange={setValue} />
      );
    }
    render(<Field />);
    const field = screen.getByLabelText('CPF') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(4, 4);
    fireEvent.keyDown(field, { key: 'Backspace' });
    expect(field).toHaveValue('124.567.890-1');
    expect(field.selectionStart).toBe(2);
    field.setSelectionRange(3, 3);
    fireEvent.keyDown(field, { key: 'Delete' });
    expect(field).toHaveValue('124.678.901');
    expect(field.selectionStart).toBe(3);
    fireEvent.change(field, { target: { value: '987.654.321-00', selectionStart: 14 } });
    expect(field).toHaveValue('987.654.321-00');
  });
});
