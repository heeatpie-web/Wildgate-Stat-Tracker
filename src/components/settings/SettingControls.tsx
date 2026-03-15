import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface SelectOption {
  id: string;
  label: string;
}

interface SegmentedControlProps {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  options, value, onChange, disabled,
}) => (
  <div className="flex gap-1 flex-wrap">
    {options.map(opt => (
      <button
        key={opt.id}
        type="button"
        disabled={disabled}
        onClick={() => onChange(opt.id)}
        className={`px-3 py-1.5 rounded-control text-label-sm font-bold transition-all disabled:opacity-disabled ${
          value === opt.id
            ? 'bg-md-sys-primary text-md-sys-on-primary'
            : 'md3-surface-high opacity-60 hover:opacity-100'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

interface OptionCyclerProps {
  options: SelectOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export const OptionCycler: React.FC<OptionCyclerProps> = ({
  options, value, onChange, disabled,
}) => {
  const idx = Math.max(0, options.findIndex(o => o.id === value));
  const prev = () => onChange(options[(idx - 1 + options.length) % options.length].id);
  const next = () => onChange(options[(idx + 1) % options.length].id);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled}
        onClick={prev}
        aria-label="Previous option"
        className="p-1 rounded-control md3-surface-high opacity-60 hover:opacity-100 disabled:opacity-disabled"
      >
        <ChevronLeft size={14} />
      </button>
      <span className="text-label-sm font-bold text-md-sys-on-surface min-w-[11rem] text-center px-1">
        {options[idx]?.label ?? value}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={next}
        aria-label="Next option"
        className="p-1 rounded-control md3-surface-high opacity-60 hover:opacity-100 disabled:opacity-disabled"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};

interface SettingRowProps {
  label: string;
  value: string;
  descriptions: Record<string, string>;
  children: React.ReactNode;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  label, value, descriptions, children,
}) => (
  <div className="py-3 border-b border-md-sys-outline/10 last:border-0">
    <div className="flex items-center justify-between gap-4">
      <span className="text-label-sm font-medium text-md-sys-on-surface/70 shrink-0">{label}</span>
      {children}
    </div>
    {descriptions[value] && (
      <p className="mt-1.5 text-label-sm text-md-sys-on-surface/50">{descriptions[value]}</p>
    )}
  </div>
);
