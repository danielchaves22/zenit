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
    primary: `${base} bg-primary text-white hover:bg-primary/90`,
    accent:  `${base} bg-accent text-white hover:bg-accent/90`,
    outline: `${base} border border-primary text-primary hover:bg-primary/10`,
    danger:  `${base} bg-danger text-white hover:bg-danger/90`,
  };

  return (
    <button className={`${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
