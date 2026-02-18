'use client';

import { ChevronDown, Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils.js';

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string | undefined;
  className?: string | undefined;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-xl border border-border/50 bg-card px-3 text-sm font-medium transition-all',
          'hover:border-primary/40 hover:bg-card/80',
          'focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
          open && 'border-primary/40 ring-2 ring-primary/20',
          value ? 'text-foreground' : 'text-muted-foreground',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown menu */}
      <div
        className={cn(
          'absolute left-0 top-full z-50 mt-1.5 min-w-[180px] overflow-hidden rounded-xl border border-border/50 bg-card shadow-xl shadow-black/20',
          'origin-top transition-all duration-200 ease-out',
          open
            ? 'scale-100 opacity-100'
            : 'pointer-events-none scale-95 opacity-0',
        )}
        role="listbox"
      >
        <div className="max-h-[240px] overflow-y-auto p-1">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  isSelected
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-foreground hover:bg-accent/50',
                )}
              >
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
