import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

function classList(values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id,
    label,
    error,
    helperText,
    className,
    disabled,
    value,
    defaultValue,
    ...rest
  },
  ref,
) {
  const hasError = Boolean(error);
  const filled = value !== undefined
    ? String(value).trim().length > 0
    : defaultValue !== undefined && String(defaultValue).trim().length > 0;
  const inputId = id ?? (label ? `wg-input-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : undefined);

  return (
    <div
      className={classList([
        'wg-input-wrap',
        disabled && 'wg-input-wrap--disabled',
        hasError && 'wg-input-wrap--error',
      ])}
      data-filled={filled ? 'true' : 'false'}
    >
      {label ? (
        <label className="wg-input-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <input
        {...rest}
        ref={ref}
        id={inputId}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={hasError || undefined}
        className={classList(['wg-input', hasError && 'wg-input--error', className])}
      />

      {hasError ? <span className="wg-input-error">{error}</span> : null}
      {!hasError && helperText ? <span className="wg-input-helper">{helperText}</span> : null}
    </div>
  );
});

export default Input;
