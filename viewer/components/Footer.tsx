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
      <div className="mx-auto grid w-full max-w-6xl gap-spacing-6 px-spacing-6 py-spacing-7 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-spacing-2 text-text-primary">
            <span
              className="inline-block h-spacing-2 w-spacing-2 rounded-pill bg-accent"
              aria-hidden="true"
            />
            <span className="text-md font-weight-emphasis">Duxo</span>
          </div>
          <p className="mt-spacing-2 text-sm text-text-secondary">
            Remote access, built in the open. Zero-budget, end-to-end encrypted.
          </p>
        </div>

        <nav className="flex flex-col gap-spacing-2 text-sm">
          <FooterLink href="/download">Download</FooterLink>
          <FooterLink href="/#features">Features</FooterLink>
          <FooterLink href="/#docs">Docs</FooterLink>
          <FooterLink href="/#changelog">Changelog</FooterLink>
        </nav>

        <nav className="flex flex-col gap-spacing-2 text-sm">
          <FooterLink href="/#security">Security</FooterLink>
          <FooterLink href="/#support">Support</FooterLink>
          <FooterLink href="/login">Sign in</FooterLink>
        </nav>
      </div>
      <div className="border-t border-border-default px-spacing-6 py-spacing-4 text-center text-xs text-text-secondary">
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
  return (
    <Link
      href={href}
      className="text-text-secondary hover:text-text-primary transition-colors duration-instant"
    >
      {children}
    </Link>
  );
}
