import { forwardRef, useEffect, useState } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  className?: string;
}

const DECIMAL_PATTERN = /^\d*\.?\d*$/;

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput({ value, onChange, min = 0, className }, ref) {
    const [text, setText] = useState(String(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
      if (!focused) {
        setText(String(value));
      }
    }, [value, focused]);

    const commit = (raw: string) => {
      const parsed = raw === '' || raw === '.' ? 0 : Number(raw);
      const next = Math.max(min, Number.isFinite(parsed) ? parsed : 0);
      onChange(next);
      setText(String(next));
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        value={focused ? text : String(value)}
        className={className}
        onFocus={(e) => {
          setFocused(true);
          setText(value === 0 ? '' : String(value));
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit(text);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '' || DECIMAL_PATTERN.test(raw)) {
            setText(raw);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
      />
    );
  },
);
