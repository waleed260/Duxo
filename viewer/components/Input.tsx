"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Duxo Input — base text field per §9.4.
 *
 * Label always visible above (never placeholder-only, §9.7 anti-pattern).
 * States: default (border.default) → hover (border.strong) → focus-visible
 * (accent 2px border, no glow) → disabled (surface.overlay bg, muted text)
 * → error (red border + aria-invalid + inline error text below — never color-only, §9.7).
 */
export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const reactId = React.useId();
    const inputId = id ?? reactId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className="text-sm font-weight-emphasis text-text-primary"
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={
            error ? errorId : hint ? hintId : undefined
          }
          className={cn(
            "min-h-[40px] w-full rounded-sm border bg-surface-overlay px-3 py-2",
            "text-md text-text-primary placeholder:text-text-secondary",
            "transition-colors duration-instant motion-reduce:transition-none",
            "hover:border-border-strong",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-0",
            "disabled:opacity-50 disabled:bg-surface-overlay",
            error
              ? "border-danger"
              : "border-border-default",
            className,
          )}
          {...props}
        />
        {/* §9.7 — Error paired with text, never color-only signaling. */}
        {error && (
          <p id={errorId} role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {!error && hint && (
          <p id={hintId} className="text-xs text-text-secondary">
            {hint}
          </p>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
