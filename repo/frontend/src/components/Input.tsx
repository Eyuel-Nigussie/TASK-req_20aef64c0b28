import React from 'react';

export interface InputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string | null;
  testId?: string;
  required?: boolean;
}

export function Input({ label, value, onChange, type = 'text', placeholder, error, testId, required }: InputProps) {
  return (
    <label className="input-field">
      <span>{label}{required ? ' *' : ''}</span>
      <input
        data-testid={testId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
      />
      {error ? <em className="error" data-testid={testId ? `${testId}-error` : undefined}>{error}</em> : null}
    </label>
  );
}
