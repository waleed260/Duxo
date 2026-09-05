"use client";

import * as React from "react";
import Link from "next/link";
import { MobileNav } from "./MobileNav";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#demo", label: "How it works" },
  { href: "/#security", label: "Security" },
];

/**
 * Marketing/auth nav — a floating pill inset from the top and sides rather
 * than a full-width bar, per DESIGN.md ("Nav").
 *
 * It never changes colour on scroll: the whole pre-app surface is one
 * continuous near-black canvas, so there is no light state to cross into.
 * What does change is the fill — translucent at rest so the hero's glow
 * shows through it, more opaque with a blur once scrolled, so text passing
 * underneath doesn't collide with the nav's own labels.
 *
 * `alwaysSolid` starts it in the opaque state for pages (login, signup)
 * whose content begins immediately under the nav with no hero behind it.
 */
export function SiteNav({ alwaysSolid = false }: { alwaysSolid?: boolean }) {
  const [scrolled, setScrolled] = React.useState(alwaysSolid);

  React.useEffect(() => {
    if (alwaysSolid) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [alwaysSolid]);

  return (
    <header className="fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6 sm:pt-6">
      <nav
        className={`relative mx-auto flex h-14 w-full max-w-[1180px] items-center justify-between rounded-full border border-white/10 px-4 transition-colors duration-300 sm:h-16 sm:px-6 ${
          scrolled ? "bg-[#0b0c0e]/85 backdrop-blur-xl" : "bg-white/[0.04] backdrop-blur-md"
        }`}
      >
        <Link
          href="/"
          className="rounded-full text-[17px] tracking-[-0.03em] text-white/94 transition-opacity duration-150 hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
          aria-label="Duxo home"
        >
          Duxo
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="rounded text-[15px] tracking-[-0.01em] text-white/70 transition-colors duration-150 hover:text-white/94 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="touch-manipulation rounded-full border border-transparent bg-white/10 px-5 py-2.5 text-[14px] leading-none text-white/94 transition-colors duration-150 hover:bg-white/[0.16] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
          >
            Log in
          </Link>
          <Link
            href="/download"
            className="touch-manipulation rounded-full border border-transparent bg-[#8fbe8e] px-5 py-2.5 text-[14px] leading-none text-[#0a0b0c] transition-colors duration-150 hover:bg-[#a2caa1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8fbe8e] focus-visible:outline-offset-2"
          >
            Download
          </Link>
        </div>

        <MobileNav links={links} />
      </nav>
    </header>
  );
}
