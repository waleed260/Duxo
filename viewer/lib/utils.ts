import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() — merge Tailwind classes safely.
 * Used by all components so we never fight specificity with one-off values.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
