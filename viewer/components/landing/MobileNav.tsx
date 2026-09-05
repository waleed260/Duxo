"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X, ChevronRight } from "lucide-react";

/**
 * Bespoke mobile menu for the light/monochrome marketing homepage.
 * Kept separate from the shared (dark) app Navbar's mobile menu since the
 * two surfaces use unrelated visual languages.
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

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center text-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {open && (
        <div className="absolute inset-x-0 top-16 z-30 border-b border-black bg-white px-6 py-6">
          <div className="flex flex-col gap-4">
            {links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm tracking-[-0.02em] text-black"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center rounded bg-black px-5 py-3 text-xs font-medium uppercase tracking-[0.1em] text-white"
              >
                Log in
              </Link>
              <Link
                href="/download"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 rounded border border-black px-5 py-3 text-xs font-medium uppercase tracking-[0.1em] text-black"
              >
                Download
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
