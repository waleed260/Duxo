"use client";

import * as React from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

/**
 * ScrollReveal — wraps children in a div that fades/slides in on scroll.
 *
 * §frontend-design motion: staggered reveals with cubic-bezier easing.
 * Directly sets data-revealed="true" on the DOM element via the hook.
 *
 * Usage:
 *   <ScrollReveal delay={200} variant="left">
 *     <YourComponent />
 *   </ScrollReveal>
 */
export function ScrollReveal({
  children,
  delay = 0,
  className = "",
  variant = "up",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  variant?: "up" | "left" | "right" | "scale";
}) {
  const ref = useScrollReveal<HTMLDivElement>({ delay });
  const variantClass =
    variant === "left"
      ? "reveal-left"
      : variant === "right"
        ? "reveal-right"
        : variant === "scale"
          ? "reveal-scale"
          : "reveal";

  return (
    <div ref={ref} className={`${variantClass} ${className}`}>
      {children}
    </div>
  );
}
