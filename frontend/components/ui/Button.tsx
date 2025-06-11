// frontend/components/ui/Button.tsx - COM CORES DINÂMICAS
import React from 'react';

export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const base = 'px-3 py-1.5 rounded font-semibold transition-all duration-200';
  const variants: Record<ButtonVariant, string> = {
    primary: `${base} bg-blue-600 text-white hover:bg-blue-700`,
    // ✅ USANDO CSS VARIABLES DINÂMICAS
    accent: `${base} bg-accent text-white hover:bg-accent-hover transform hover:scale-[1.02] active:scale-[0.98]`,
    outline: `${base} border border-gray-600 text-gray-300 hover:bg-[#1e2126] hover:border-accent hover:text-accent`,
    danger: `${base} bg-red-600 text-white hover:bg-red-700`,
  };

  return (
    <button className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}