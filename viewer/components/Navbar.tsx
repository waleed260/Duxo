"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Menu, X, LayoutDashboard, Settings } from "lucide-react";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { useUser } from "@clerk/nextjs";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

/**
 * Duxo Navbar — §3.4 + §9.3 wireframe.
 *
 * "View source on GitHub" link near the TOP, not buried in a footer — trust
 * signal placement matters as much as the pitch for a remote-control product
 * built on Rs. 0 (§3.1).
 *
 * Mobile: hamburger menu for narrow viewports (§9.3b #11).
 */
export const Navbar = React.memo(function Navbar({ className }: { className?: string }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { user, isLoaded } = useUser();

  // Close mobile menu on route change / resize
  React.useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-border-default bg-surface-base/95 backdrop-blur",
        className,
      )}
    >
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <Link
          href="/"
          className="flex items-center gap-2 text-text-primary"
          aria-label="Duxo home"
        >
          <span
            className="inline-block h-2 w-2 rounded-pill bg-accent"
            aria-hidden="true"
          />
          <span className="text-lg font-emphasis">Duxo</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-ds-7 text-sm">
          <NavLink href="/download">Download</NavLink>
          {user ? (
            <>
              <NavLink href="/dashboard">
                <LayoutDashboard className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Dashboard
              </NavLink>
              <NavLink href="/settings">
                <Settings className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Settings
              </NavLink>
            </>
          ) : (
            <>
              <NavLink href="/#features">Features</NavLink>
              <NavLink href="/#demo">How it works</NavLink>
            </>
          )}
          <NavLink
            href="https://github.com/waleed260/Duxo"
            external
          >
            <GithubIcon className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            GitHub
          </NavLink>
          {user ? (
            <Button asChild size="md">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <Button asChild size="md" leadingIcon={<Download className="h-4 w-4" />}>
              <Link href="/download">Get Duxo</Link>
            </Button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="md:hidden flex items-center justify-center min-h-[40px] min-w-[40px] text-text-secondary hover:text-text-primary transition-colors duration-instant"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border-default bg-surface-base">
          <div className="flex flex-col gap-1 px-6 py-4">
            <MobileNavLink href="/download" onClick={() => setMobileOpen(false)}>
              Download
            </MobileNavLink>
            {user ? (
              <>
                <MobileNavLink href="/dashboard" onClick={() => setMobileOpen(false)}>
                  <LayoutDashboard className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                  Dashboard
                </MobileNavLink>
                <MobileNavLink href="/settings" onClick={() => setMobileOpen(false)}>
                  <Settings className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
                  Settings
                </MobileNavLink>
              </>
            ) : (
              <>
                <MobileNavLink href="/#features" onClick={() => setMobileOpen(false)}>
                  Features
                </MobileNavLink>
                <MobileNavLink href="/#demo" onClick={() => setMobileOpen(false)}>
                  How it works
                </MobileNavLink>
              </>
            )}
            <MobileNavLink
              href="https://github.com/waleed260/Duxo"
              external
              onClick={() => setMobileOpen(false)}
            >
              <GithubIcon className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
              GitHub
            </MobileNavLink>
            <div className="mt-3">
              {user ? (
                <Button asChild className="w-full">
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
              ) : (
                <Button
                  asChild
                  className="w-full"
                  leadingIcon={<Download className="h-4 w-4" />}
                >
                  <Link href="/download" onClick={() => setMobileOpen(false)}>
                    Get Duxo
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
});

function NavLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="text-text-secondary hover:text-text-primary transition-colors duration-instant"
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  children,
  external,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      onClick={onClick}
      className="block rounded-sm px-3 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors duration-instant"
    >
      {children}
    </Link>
  );
}
