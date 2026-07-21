"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Duxo CodeInput — §9.4 + §3.5 accessibility.
 *
 * Anatomy: inputmode="numeric" for mobile keyboards, monospace / tabular
 * figures, grouped display (0000 0000) — gets read aloud over the phone in
 * real support scenarios.
 *
 * Behavior: more than 8 digits is blocked at the input level (maxlength),
 * never silently truncated after submit (§9.4 long-content edge case).
 * Error announced via aria-live (§3.5).
 */
export interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
}

export function CodeInput({
  value,
  onChange,
  error,
  disabled,
  label = "Connection code",
}: CodeInputProps) {
  const reactId = React.useId();
  const errorId = `${reactId}-error`;

  // Strip non-digits before storing; display layer adds the grouping space.
  const handle = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    onChange(digits);
  };

  // Display grouped as XXXX XXXX for readability when read aloud.
  const grouped = value.length > 4 ? `${value.slice(0, 4)} ${value.slice(4)}` : value;

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={reactId}
        className="text-sm font-weight-emphasis text-text-primary"
      >
        {label}
      </label>
      <input
        id={reactId}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        // maxlength blocks overflow at the input level — §9.4.
        maxLength={9} // 8 digits + 1 grouping space
        value={grouped}
        disabled={disabled}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => handle(e.target.value)}
        placeholder="0000 0000"
        className={cn(
          // Tabular-figures font keeps digits aligned in the grouped display.
          "min-h-[48px] w-full rounded-sm border bg-surface-overlay px-4 py-3",
          "font-mono text-2xl tabular-nums tracking-[0.2em] text-text-primary",
          "placeholder:text-text-secondary placeholder:tracking-[0.2em]",
          "transition-colors duration-instant motion-reduce:transition-none",
          "hover:border-border-strong",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0",
          "disabled:opacity-50",
          error ? "border-danger" : "border-border-default",
        )}
      />
      {/* §3.5 — Error announced via aria-live region. */}
      {error && (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
