import React from 'react';
export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'danger';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}
export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const style = variant === 'accent' ? 'primary' : variant;
  return (
    <button className={`admin-button admin-button-${style} ${className}`} {...props}>
      {children}
    </button>
  );
}
