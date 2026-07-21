import Link from "next/link";

/**
 * Duxo Footer — §3.4 + Part 11 marketing site IA.
 *
 * Home → Features → Download → Blog → Docs → Changelog → Support.
 * Same token system as the app end-to-end (§9.2 / Part 11).
 */
export function Footer() {
  return (
    <footer aria-label="Site footer" className="border-t border-border-default bg-surface-base">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-6 py-7 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-text-primary">
            <span
              className="inline-block h-2 w-2 rounded-pill bg-accent"
              aria-hidden="true"
            />
            <span className="text-md font-weight-emphasis">Duxo</span>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Remote access, built in the open. Zero-budget, end-to-end encrypted.
          </p>
        </div>

        <nav className="flex flex-col gap-2 text-sm">
          <FooterLink href="/download">Download</FooterLink>
          <FooterLink href="/#features">Features</FooterLink>
          <FooterLink href="/#demo">How it works</FooterLink>
          <FooterLink href="/login">Sign in</FooterLink>
        </nav>

        <nav className="flex flex-col gap-2 text-sm">
          <FooterLink href="/#security">Security</FooterLink>
          <FooterLink href="https://github.com/duxo-org/duxo">GitHub</FooterLink>
          <FooterLink href="https://github.com/duxo-org/duxo/blob/main/SECURITY.md">Security policy</FooterLink>
          <FooterLink href="https://github.com/duxo-org/duxo/blob/main/CONTRIBUTING.md">Contributing</FooterLink>
        </nav>
      </div>
      <div className="border-t border-border-default px-6 py-4 text-center text-xs text-text-secondary">
        © {new Date().getFullYear()} Duxo — open source, MIT licensed.
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const isExternal = href.startsWith("http");
  return (
    <Link
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      className="text-text-secondary hover:text-text-primary transition-colors duration-instant"
    >
      {children}
    </Link>
  );
}
