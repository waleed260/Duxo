"use client";

import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Duxo Button — §9.4.
 *
 * Primary = pill, accent fill. States:
 *   default → hover (+6% lightened) → focus-visible (white 2px outline, offset 2)
 *   → active (-6% darkened) → disabled (40% opacity, aria-disabled) → loading
 *   (label→spinner, width retained to prevent layout shift).
 *
 * Keyboard: Tab-focusable, activates on Enter/Space.
 * Pointer/touch: ≥40px hit target (44px on touch) per WCAG 2.2 SC 2.5.8.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Leading icon slot — always paired with a label, never icon-only (§9.3b #5). */
  leadingIcon?: React.ReactNode;
  /**
   * Render the child element — a Next `<Link>`, usually — with these styles,
   * instead of a `<button>`.
   *
   * The alternative, `<Link><Button/></Link>`, puts a `<button>` inside an
   * `<a>`. That is invalid HTML, and browsers disagree about it in the way
   * that matters: Chromium follows the anchor, **Firefox activates the button
   * and does not navigate**. Every navigation control built that way — the
   * navbar, the landing page's two hero calls to action — silently did
   * nothing in Firefox, which is one of the two browsers this project's
   * Playwright config targets.
   */
  asChild?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Pill radius per §9.2/§9.4 — matches AnyDesk's own pill-button convention.
  primary:
    "rounded-pill bg-accent text-text-primary hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "rounded-md bg-surface-overlay text-text-primary border border-border-default hover:border-border-strong",
  ghost:
    "rounded-md bg-transparent text-text-secondary hover:text-text-primary hover:bg-surface-raised",
  // §9.4 — End/disconnect: danger-red icon color as its only deviation.
  danger:
    "rounded-md bg-transparent text-danger border border-danger hover:bg-danger hover:text-text-primary",
};

const sizeClasses: Record<ButtonSize, string> = {
  // Min 40px hit target height, 44px on touch surfaces (§9.4).
  md: "min-h-[40px] px-4 py-2 text-sm",
  lg: "min-h-[44px] px-6 py-3 text-md",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leadingIcon,
      disabled,
      children,
      type = "button",
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || isLoading;
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        // `type` and `disabled` are button attributes; React would warn about
        // both on an anchor, and `disabled` does nothing there anyway.
        {...(asChild ? {} : { type, disabled: isDisabled })}
        aria-disabled={isDisabled || undefined}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-base",
          "transition-colors duration-instant motion-reduce:transition-none",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-primary focus-visible:outline-offset-2",
          variantClasses[variant],
          sizeClasses[size],
          isDisabled && "pointer-events-none opacity-40",
          className,
        )}
        {...props}
      >
        {isLoading && (
          <Loader2
            className="h-4 w-4 animate-spin"
            // Spinner is decorative — label remains accessible via children.
            aria-hidden="true"
          />
        )}
        {!isLoading && leadingIcon}
        {/* Slottable keeps the icon and spinner as siblings of the label
            inside the rendered child, rather than replacing them. */}
        <Slottable>{children}</Slottable>
      </Comp>
    );
  },
);
Button.displayName = "Button";
