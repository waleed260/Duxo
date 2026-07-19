"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

/**
 * Duxo Navbar — §3.4 + §9.3 wireframe.
 *
 * "View source on GitHub" link near the TOP, not buried in a footer — trust
 * signal placement matters as much as the pitch for a remote-control product
 * built on Rs. 0 (§3.1).
 */
export function Navbar({ className }: { className?: string }) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 border-b border-border-default bg-surface-base/95 backdrop-blur",
        className,
      )}
    >
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-spacing-6 py-spacing-3">
        <Link
          href="/"
          className="flex items-center gap-spacing-2 text-text-primary"
          aria-label="Duxo home"
        >
          <span
            className="inline-block h-spacing-2 w-spacing-2 rounded-pill bg-accent"
            aria-hidden="true"
          />
          <span className="text-lg font-weight-emphasis">Duxo</span>
        </Link>

        <div className="flex items-center gap-spacing-5 text-sm">
          <NavLink href="/#features">Features</NavLink>
          <NavLink href="/download">Download</NavLink>
          <NavLink href="/#docs">Docs</NavLink>
          <Link href="/login">
            <Button size="md" leadingIcon={<Download className="h-4 w-4" />}>
              Get Duxo
            </Button>
          </Link>
        </div>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-text-secondary hover:text-text-primary transition-colors duration-instant"
    >
      {children}
    </Link>
  );
}
