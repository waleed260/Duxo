import Link from "next/link";

/**
 * Shared footer for the marketing homepage and the auth pages, so the whole
 * pre-app experience reads as one surface. Sits on the same canvas as
 * everything above it — separated by space and a single hairline, not by a
 * background change (DESIGN.md, "Page Patterns").
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.07]">
      <div className="mx-auto grid w-full max-w-[1180px] gap-10 px-6 py-16 sm:grid-cols-3">
        <div>
          <span className="text-[17px] tracking-[-0.03em] text-white/94">Duxo</span>
          <p className="mt-3 max-w-[38ch] text-[15px] leading-[1.55] tracking-[-0.01em] text-white/50">
            Remote access, built in the open. Zero-budget, end-to-end
            encrypted.
          </p>
        </div>

        <FooterGroup
          title="Product"
          links={[
            { href: "/download", label: "Download" },
            { href: "/#features", label: "Features" },
            { href: "/#demo", label: "How it works" },
            { href: "/login", label: "Sign in" },
          ]}
        />

        <FooterGroup
          title="Resources"
          links={[
            { href: "/#security", label: "Security" },
            {
              href: "https://github.com/waleed260/Duxo/blob/main/SECURITY.md",
              label: "Security policy",
            },
            {
              href: "https://github.com/waleed260/Duxo/blob/main/CONTRIBUTING.md",
              label: "Contributing",
            },
          ]}
        />
      </div>

      {/* Closing statement — display type at the page's widest, line-height
          locked to 1 like every other display size on the surface. */}
      <div className="px-6 pb-4 pt-8 text-center">
        <span className="block text-[15vw] leading-none tracking-[-0.04em] text-white/[0.07] sm:text-[128px] lg:text-[168px]">
          Connect freely.
        </span>
      </div>

      <div className="border-t border-white/[0.07] px-6 py-6 text-center text-[13px] tracking-[-0.01em] text-white/40">
        © {new Date().getFullYear()} Duxo — open source, MIT licensed.
      </div>
    </footer>
  );
}

function FooterGroup({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <nav className="flex flex-col gap-3">
      <span className="text-[12px] uppercase tracking-[0.08em] text-white/40">{title}</span>
      {links.map((l) => {
        const isExternal = l.href.startsWith("http");
        return (
          <Link
            key={l.label}
            href={l.href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="rounded text-[15px] tracking-[-0.01em] text-white/70 transition-colors duration-150 hover:text-white/94 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-4"
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
