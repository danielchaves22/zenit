// frontend/components/ui/CurrencyInput.tsx
import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps {
  id?: string;
  label?: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  error?: string;
}

export function CurrencyInput({
  id,
  label,
  value,
  onChange,
  placeholder = "0,00",
  required = false,
  disabled = false,
  className = '',
  inputClassName = '',
  error
}: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = useState('0,00');
  const inputRef = useRef<HTMLInputElement>(null);

  // Converte valor numérico para string formatada
  const formatCurrency = (cents: number): string => {
    const reais = Math.floor(cents / 100);
    const centavos = cents % 100;
    return `${reais.toLocaleString('pt-BR')},${centavos.toString().padStart(2, '0')}`;
  };

  // Converte string para centavos, removendo formatação
  const parseCurrency = (formatted: string): number => {
    // Remove tudo que não é dígito
    const digits = formatted.replace(/\D/g, '');
    return parseInt(digits) || 0;
  };

  // Converte centavos para valor decimal
  const centsToDecimal = (cents: number): string => {
    return (cents / 100).toFixed(2);
  };

  // Inicializa o valor quando o componente é montado ou value muda
  useEffect(() => {
    if (value !== undefined && value !== null) {
      let cents: number;
      
      if (typeof value === 'string') {
        // Se é string, pode vir formatada ou como decimal
        if (value.includes(',')) {
          // Já formatada (1.234,56)
          cents = parseCurrency(value);
        } else {
          // Decimal (1234.56)
          cents = Math.round(parseFloat(value) * 100) || 0;
        }
      } else {
        // Se é number, converte para centavos
        cents = Math.round(value * 100) || 0;
      }
      
      setDisplayValue(formatCurrency(cents));
    }
  }, [value]);

  const applyMask = (inputValue: string, cursorPosition: number, wasBackspaceAtEnd: boolean = false) => {
    // Extrair apenas os dígitos
    const digits = inputValue.replace(/\D/g, '');
    
    // Se não há dígitos, retorna zero
    if (!digits) {
      const formatted = '0,00';
      return {
        formatted,
        newCursorPosition: formatted.length
      };
    }

    // Limitar a 11 dígitos (999.999.999,99)
    const limitedDigits = digits.slice(0, 11);
    const cents = parseInt(limitedDigits);
    const formatted = formatCurrency(cents);

    // Calcular nova posição do cursor
    // Se o valor anterior era zero (0,00), posicionar no final
    const wasZero = parseCurrency(displayValue) === 0;
    
    if (wasZero) {
      // Se estava zerado, cursor vai para o final
      return {
        formatted,
        newCursorPosition: formatted.length
      };
    }

    // Se foi backspace no final e o cursor deveria ficar no final
    if (wasBackspaceAtEnd) {
      return {
        formatted,
        newCursorPosition: formatted.length
      };
    }

    // Caso contrário, calcular posição baseada nos dígitos
    const originalDigitsBeforeCursor = inputValue.slice(0, cursorPosition).replace(/\D/g, '').length;
    
    let newCursorPosition = 0;
    let digitCount = 0;
    
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        digitCount++;
        if (digitCount > originalDigitsBeforeCursor) {
          newCursorPosition = i;
          break;
        }
      }
      newCursorPosition = i + 1;
    }

    return {
      formatted,
      newCursorPosition: Math.min(newCursorPosition, formatted.length)
    };
  };

  const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
    const input = e.target as HTMLInputElement;
    const inputValue = input.value;
    const cursorPosition = input.selectionStart || 0;

    const { formatted, newCursorPosition } = applyMask(inputValue, cursorPosition);
    
    // Atualizar valor
    setDisplayValue(formatted);
    
    // Converter para decimal e notificar mudança
    const cents = parseCurrency(formatted);
    onChange(centsToDecimal(cents));

    // Restaurar posição do cursor após a formatação
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Permitir teclas de controle e navegação
    const allowedKeys = [
      'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
      'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
      'Home', 'End'
    ];

    if (allowedKeys.includes(e.key)) {
      // Tratamento especial para backspace quando cursor está no final
      if (e.key === 'Backspace' && inputRef.current) {
        const input = inputRef.current;
        const cursorPosition = input.selectionStart || 0;
        const isAtEnd = cursorPosition === input.value.length;
        
        if (isAtEnd && parseCurrency(displayValue) > 0) {
          e.preventDefault();
          
          // Remover último dígito
          const currentCents = parseCurrency(displayValue);
          const newCents = Math.floor(currentCents / 10);
          const formatted = formatCurrency(newCents);
          
          setDisplayValue(formatted);
          onChange(centsToDecimal(newCents));
          
          // Manter cursor no final
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.setSelectionRange(formatted.length, formatted.length);
            }
          }, 0);
          
          return;
        }
      }
      return;
    }

    // Permitir Ctrl+A, Ctrl+C, Ctrl+V, etc.
    if (e.ctrlKey || e.metaKey) {
      return;
    }

    // Se digitou um número e o valor atual é zero, posicionar cursor no final ANTES de processar
    if (/^\d$/.test(e.key)) {
      const currentCents = parseCurrency(displayValue);
      if (currentCents === 0 && inputRef.current) {
        e.preventDefault(); // Impedir a digitação padrão
        
        // Posicionar cursor no final primeiro
        const length = inputRef.current.value.length;
        inputRef.current.setSelectionRange(length, length);
        
        // Adicionar o dígito no final
        const newValue = displayValue + e.key;
        if (inputRef.current) {
          inputRef.current.value = newValue;
          // Aplicar máscara e atualizar valor
          const { formatted, newCursorPosition } = applyMask(newValue, newValue.length);
          setDisplayValue(formatted);
          const cents = parseCurrency(formatted);
          onChange(centsToDecimal(cents));
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
            }
          }, 0);
        }
        return;
      }
      return; // Permitir que o onInput processe normalmente para valores não-zero
    }

    // Bloquear outras teclas que não sejam permitidas
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Se o valor é zero, selecionar tudo para facilitar digitação
    if (displayValue === '0,00') {
      e.target.select();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;

    const pastedText = e.clipboardData.getData('text');
    const input = e.target as HTMLInputElement;
    
    // Limpar texto colado (manter apenas dígitos)
    const cleanText = pastedText.replace(/\D/g, '');
    
    if (cleanText) {
      // Inserir dígitos na posição atual
      const currentValue = input.value;
      const selectionStart = input.selectionStart || 0;
      const selectionEnd = input.selectionEnd || 0;
      
      // Substituir seleção ou inserir na posição do cursor
      const newValue = currentValue.slice(0, selectionStart) + cleanText + currentValue.slice(selectionEnd);
      
      // Aplicar máscara
      const { formatted, newCursorPosition } = applyMask(newValue, selectionStart + cleanText.length);
      
      // Atualizar valor
      setDisplayValue(formatted);
      
      // Converter para decimal e notificar mudança
      const cents = parseCurrency(formatted);
      onChange(centsToDecimal(cents));

      // Posicionar cursor
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition);
        }
      }, 0);
    }
  };

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-gray-300" htmlFor={id}>
          {label}
          {required && <span className="text-red-400 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
          R$
        </span>
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={displayValue}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onPaste={handlePaste}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          className={`w-full pl-10 pr-3 py-1.5 bg-[#1e2126] border border-gray-700 text-white rounded focus:outline-none focus:ring focus:border-[#2563eb] text-right font-mono ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${error ? 'border-red-500' : ''} ${inputClassName}`}
          autoComplete="off"
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}