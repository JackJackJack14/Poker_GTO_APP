import { forwardRef, useEffect, useState } from 'react';

interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  /** กด Enter หลัง parse ค่า (ใช้ยืนยัน Raise) */
  onEnterCommit?: (value: number) => void;
  min?: number;
  className?: string;
  disabled?: boolean;
  /** ค่าว่างเมื่อ value === 0 + แสดง placeholder (ค่าเริ่มต้น true) */
  emptyWhenZero?: boolean;
  placeholder?: string;
}

const DECIMAL_PATTERN = /^\d*\.?\d*$/;

export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    {
      value,
      onChange,
      onEnterCommit,
      min = 0,
      className,
      disabled = false,
      emptyWhenZero = true,
      placeholder = '0',
    },
    ref,
  ) {
    const [text, setText] = useState(() =>
      emptyWhenZero && value === 0 ? '' : String(value),
    );
    const [focused, setFocused] = useState(false);

    useEffect(() => {
      if (!focused) {
        setText(emptyWhenZero && value === 0 ? '' : String(value));
      }
    }, [value, focused, emptyWhenZero]);

    const parseRaw = (raw: string) => {
      const parsed = raw === '' || raw === '.' ? 0 : Number(raw);
      return Math.max(min, Number.isFinite(parsed) ? parsed : 0);
    };

    const commit = (raw: string) => {
      const next = parseRaw(raw);
      onChange(next);
      setText(emptyWhenZero && next === 0 ? '' : String(next));
      return next;
    };

    const displayValue = focused
      ? text
      : emptyWhenZero && value === 0
        ? ''
        : String(value);

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={displayValue}
        placeholder={placeholder}
        className={className}
        onFocus={(e) => {
          if (disabled) return;
          setFocused(true);
          setText(emptyWhenZero && value === 0 ? '' : String(value));
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          // อัปเดตเฉพาะค่าในช่อง — ไม่ถือว่ายืนยันแอคชั่น (caller ต้องกด Raise)
          commit(text);
        }}
        onChange={(e) => {
          if (disabled) return;
          const raw = e.target.value;
          if (raw === '' || DECIMAL_PATTERN.test(raw)) {
            setText(raw);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const next = commit(text);
            setFocused(false);
            onEnterCommit?.(next);
            e.currentTarget.blur();
          }
        }}
      />
    );
  },
);
