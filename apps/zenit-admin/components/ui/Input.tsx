import React, { useId } from 'react';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return (
    <div className={`admin-field ${className}`}>
      {label && (
        <label className="admin-label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <input
        {...props}
        id={fieldId}
        className="admin-input"
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${fieldId}-error` : props['aria-describedby']}
      />
      {error && (
        <p id={`${fieldId}-error`} className="mt-2 text-sm text-tone-red">
          {error}
        </p>
      )}
    </div>
  );
}
