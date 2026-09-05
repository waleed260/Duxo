"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { MobileNav } from "./MobileNav";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/#demo", label: "How it works" },
  { href: "/#security", label: "Security" },
];

/**
 * Marketing homepage nav — transparent over the hero's dark backdrop,
 * switching to a solid white hairline-bordered bar once scrolled past it.
 * `fixed` (not `sticky`) so it overlays the hero rather than pushing it
 * down; the hero reserves its own top padding to clear the bar's height.
 */
export function LightNav() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 560);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 z-30 w-full transition-colors duration-200 ${
        scrolled ? "border-b border-black bg-white" : "border-b border-transparent bg-transparent"
      }`}
    >
      <nav className="relative mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-6 sm:h-20">
        <Link
          href="/"
          className={`text-lg font-medium tracking-[-0.03em] transition-colors duration-200 ${
            scrolled ? "text-black" : "text-white"
          }`}
          aria-label="Duxo home"
        >
          Duxo
        </Link>

        <div className="hidden items-center gap-9 md:flex">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className={`text-sm tracking-[-0.02em] transition-colors duration-200 ${
                scrolled ? "text-[#121211] hover:text-[#575551]" : "text-white/85 hover:text-white"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className={`rounded border px-5 py-2.5 text-xs font-medium uppercase tracking-[0.1em] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              scrolled
                ? "border-black text-black hover:bg-black hover:text-white focus-visible:outline-black"
                : "border-white/70 text-white hover:bg-white hover:text-black focus-visible:outline-white"
            }`}
          >
            Log in
          </Link>
          <Link
            href="/download"
            className={`inline-flex items-center gap-1.5 rounded px-5 py-2.5 text-xs font-medium uppercase tracking-[0.1em] transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              scrolled
                ? "bg-black text-white hover:bg-[#2a2a28] focus-visible:outline-black"
                : "bg-white text-black hover:bg-white/90 focus-visible:outline-white"
            }`}
          >
            Download
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        <MobileNav links={links} light={!scrolled} />
      </nav>
    </header>
  );
}
