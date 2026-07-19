"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Duxo Card — §9.4 Dashboard action card anatomy.
 *
 * Anatomy: icon badge, title, one-line description, single CTA button.
 * Surface.raised background, radius.md.
 *
 * States: default → hover (border.default → border.strong transition,
 * duration.instant, NO lift/shadow per the no-shadow rule §9.2) →
 * focus-visible (when card itself is the tab target). Internal button
 * carries its own states independently.
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: keyof JSX.IntrinsicElements;
}

export const Card = React.forwardRef<HTMLElement, CardProps>(
  ({ className, children, as = "div", ...props }, ref) => {
    const Comp = as as React.ElementType;
    return (
      <Comp
        ref={ref}
        className={cn(
          "flex flex-col gap-spacing-4 rounded-md bg-surface-raised border border-border-default",
          "p-spacing-6 transition-colors duration-instant motion-reduce:transition-none",
          "hover:border-border-strong focus-within:border-border-strong",
          className,
        )}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Card.displayName = "Card";

export function CardIconBadge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Icon badge — accent-tinted to keep the single-accent rule (§9.2).
        "flex h-spacing-7 w-spacing-7 items-center justify-center rounded-sm",
        "bg-surface-overlay text-accent",
        className,
      )}
    >
      {children}
    </div>
  );
}
