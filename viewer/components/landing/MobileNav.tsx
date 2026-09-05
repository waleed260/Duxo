"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

/**
 * Mobile menu for the marketing/auth surface. Kept separate from the shared
 * app Navbar's mobile menu — that one hangs off a full-width bar, this one
 * has to hang off a floating pill, so it drops a rounded sheet below the
 * pill rather than a flush panel.
 *
 * The trigger and the sheet are both dark: unlike the previous light
 * marketing surface there is no transparent-over-hero state to invert for,
 * so this takes no tone prop.
 */
export function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Close on Escape — the sheet overlays content and is dismissible.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full text-white/94 transition-colors duration-150 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* The sheet is fully opaque, not translucent: the hero's 46px display
          type sits directly behind it, and even at 95% it stayed legible
          through the panel and fought the menu items. */}
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+8px)] z-40 rounded-3xl border border-white/10 bg-[#0b0c0e] p-6">
          <div className="flex flex-col gap-5">
            {links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded text-[15px] tracking-[-0.01em] text-white/70 transition-colors duration-150 hover:text-white/94 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-1 flex flex-col gap-2.5">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center rounded-full bg-white/10 px-5 py-3 text-[14px] leading-none text-white/94 transition-colors duration-150 hover:bg-white/[0.16] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
              >
                Log in
              </Link>
              <Link
                href="/download"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center rounded-full bg-[#8fbe8e] px-5 py-3 text-[14px] leading-none text-[#0a0b0c] transition-colors duration-150 hover:bg-[#a2caa1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8fbe8e] focus-visible:outline-offset-2"
              >
                Download
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
