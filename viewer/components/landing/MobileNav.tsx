"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X, ChevronRight } from "lucide-react";

/**
 * Bespoke mobile menu for the light/monochrome marketing homepage.
 * Kept separate from the shared (dark) app Navbar's mobile menu since the
 * two surfaces use unrelated visual languages.
 *
 * `light` controls the closed/open toggle icon color only — it's true while
 * the nav bar itself is still transparent over the hero photo/glow, false
 * once LightNav has scrolled to its solid white state. The dropdown panel
 * is always a solid white overlay, so its own contents stay black/graphite
 * regardless.
 */
export function MobileNav({
  links,
  light = false,
}: {
  links: { href: string; label: string }[];
  light?: boolean;
}) {
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
        className={`flex h-10 w-10 items-center justify-center transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          light ? "text-white focus-visible:outline-white" : "text-black focus-visible:outline-black"
        }`}
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
                className="rounded text-sm tracking-[-0.02em] text-black transition-colors duration-150 hover:text-[#575551] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
              >
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-3">
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center rounded bg-black px-5 py-3 text-xs font-medium uppercase tracking-[0.1em] text-white transition-colors duration-150 hover:bg-[#2a2a28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
              >
                Log in
              </Link>
              <Link
                href="/download"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center gap-1.5 rounded border border-black px-5 py-3 text-xs font-medium uppercase tracking-[0.1em] text-black transition-colors duration-150 hover:bg-black hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
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
