"use client";

import { useEffect, useRef } from "react";

/**
 * useScrollReveal — triggers CSS reveal animations when an element scrolls
 * into view.
 *
 * Directly sets `data-revealed="true"` on the DOM element when it becomes
 * visible. The CSS classes (`.reveal`, `.reveal-left`, etc.) define the
 * visual transitions that respond to this attribute.
 *
 * Usage:
 *   const ref = useScrollReveal<HTMLDivElement>({ delay: 200 });
 *   <div ref={ref} className="reveal">content</div>
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  options: { delay?: number; threshold?: number } = {},
) {
  const { delay = 0, threshold = 0.15 } = options;
  const ref = useRef<T>(null);
  const revealedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || revealedRef.current) return;

    // Skip animation if user prefers reduced motion
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      el.dataset.revealed = "true";
      revealedRef.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (delay > 0) {
            setTimeout(() => {
              el.dataset.revealed = "true";
              revealedRef.current = true;
            }, delay);
          } else {
            el.dataset.revealed = "true";
            revealedRef.current = true;
          }
          observer.unobserve(el);
        }
      },
      { threshold, rootMargin: "0px 0px -40px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold, delay]);

  return ref;
}
