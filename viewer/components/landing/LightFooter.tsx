import Link from "next/link";

/**
 * Shared light/monochrome footer — used on the marketing homepage and on
 * the auth pages (login/signup) so the whole pre-app experience reads as
 * one consistent surface.
 */
export function LightFooter() {
  return (
    <footer className="border-t border-black bg-white">
      <div className="mx-auto grid w-full max-w-[1280px] gap-10 px-6 py-16 sm:grid-cols-3">
        <div>
          <span className="text-lg font-medium tracking-[-0.03em] text-black">Duxo</span>
          <p className="mt-3 text-sm leading-[1.43] tracking-[-0.01em] text-[#575551]">
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

      <div className="border-t border-black px-6 py-10 text-center sm:py-14">
        <span className="text-[15vw] font-medium leading-none tracking-[-0.04em] text-black sm:text-[100px]">
          Connect freely.
        </span>
      </div>

      <div className="border-t border-black px-6 py-5 text-center text-xs tracking-[-0.01em] text-[#958d7e]">
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
    <nav className="flex flex-col gap-2.5">
      <span className="text-xs font-medium uppercase tracking-[0.1em] text-[#575551]">{title}</span>
      {links.map((l) => {
        const isExternal = l.href.startsWith("http");
        return (
          <Link
            key={l.label}
            href={l.href}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="rounded text-sm tracking-[-0.01em] text-black transition-colors duration-150 hover:text-[#575551] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
