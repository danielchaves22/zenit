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
  const base = 'inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';
  const variants: Record<ButtonVariant, string> = {
    primary: `${base} bg-accent text-on-accent hover:bg-accent-hover`,
    // ✅ USANDO CSS VARIABLES DINÂMICAS
    accent: `${base} bg-accent text-on-accent hover:bg-accent-hover`,
    outline: `${base} border border-border-strong text-text-muted hover:bg-elevated hover:border-accent hover:text-accent`,
    danger: `${base} bg-red-600 text-on-solid hover:bg-red-700`,
  };

  return (
    <button className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}