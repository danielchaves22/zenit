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
        <label className="block text-sm font-medium mb-1" htmlFor={props.id}>
          {label}
        </label>
      )}
      <input
        id={props.id}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring focus:border-primary"
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
