// frontend/components/ui/Input.tsx
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-text-muted" htmlFor={props.id}>
          {label}
        </label>
      )}
      <input
        id={props.id}
        className="w-full px-2 py-1.5 bg-background border border-border text-text rounded focus:outline-none focus:ring focus:border-accent"
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-tone-red">
          {error}
        </p>
      )}
    </div>
  );
}
