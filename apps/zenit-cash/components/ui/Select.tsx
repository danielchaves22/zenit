// frontend/components/ui/Select.tsx
import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: Array<{ value: string; label: string }>;
}

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className={`${className}`}>
      {label && (
        <label className="block text-sm font-medium mb-1 text-text-muted" htmlFor={props.id}>
          {label}
        </label>
      )}
      <select
        className="bg-background border border-border text-text rounded px-2 py-1.5 focus:outline-none focus:ring focus:border-accent"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}