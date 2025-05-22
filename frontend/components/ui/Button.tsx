// frontend/components/ui/Button.tsx
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
  const base = 'px-4 py-2 rounded-lg font-semibold transition';
  const variants: Record<ButtonVariant, string> = {
    primary: `${base} bg-blue-600 text-white hover:bg-blue-700`,
    accent:  `${base} bg-[#f59e0b] text-white hover:bg-[#e08c07]`,
    outline: `${base} border border-gray-600 text-gray-300 hover:bg-[#1e2126]`,
    danger:  `${base} bg-red-600 text-white hover:bg-red-700`,
  };

  return (
    <button className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}