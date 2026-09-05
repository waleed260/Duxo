"use client";

import { SignUp } from "@clerk/nextjs";
import { SiteNav } from "@/components/landing/SiteNav";
import { SiteFooter } from "@/components/landing/SiteFooter";

/**
 * Clerk's appearance is themed to viewer/DESIGN.md rather than left on its
 * defaults, so the auth step doesn't drop out of the surface the landing
 * page establishes. Kept in sync with app/login/page.tsx.
 */
export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-[#050506] text-white/94 antialiased" style={{ colorScheme: "dark" }}>
      <SiteNav alwaysSolid />
      <main className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-md flex-col justify-center px-6 py-32">
        <div
          className="pointer-events-none absolute left-1/2 top-1/4 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(143,190,142,0.16) 0%, transparent 70%)" }}
          aria-hidden="true"
        />
        <SignUp
          routing="hash"
          appearance={{
            variables: {
              colorPrimary: "#8fbe8e",
              colorBackground: "#0d0e11",
              colorForeground: "rgba(255,255,255,0.94)",
              colorMutedForeground: "rgba(255,255,255,0.5)",
              colorInput: "rgba(255,255,255,0.04)",
              colorInputForeground: "rgba(255,255,255,0.94)",
              colorDanger: "#e8552b",
              borderRadius: "12px",
            },
            elements: {
              rootBox: "mx-auto w-full",
              card: "bg-[#0d0e11] border border-white/[0.07] shadow-none rounded-2xl p-8",
              headerTitle: "text-white/94 font-normal tracking-[-0.02em]",
              headerSubtitle: "text-white/50",
              socialButtonsBlockButton:
                "touch-manipulation bg-white/[0.06] border border-white/[0.07] text-white/94 hover:bg-white/[0.12] transition-colors duration-150 rounded-full",
              socialButtonsBlockButtonText: "text-[14px] font-normal",
              dividerLine: "bg-white/10",
              dividerText: "text-white/40 text-[12px] uppercase tracking-[0.08em]",
              formFieldLabel: "text-white/50 text-sm font-normal",
              formFieldInput:
                "bg-white/[0.04] border border-white/[0.07] text-white/94 rounded-xl focus:border-[#8fbe8e] focus:ring-1 focus:ring-[#8fbe8e]",
              formButtonPrimary:
                "touch-manipulation bg-[#8fbe8e] hover:bg-[#a2caa1] text-[#0a0b0c] text-[15px] font-normal rounded-full transition-colors duration-150 normal-case",
              footerActionLink: "text-[#8fbe8e] hover:text-[#a2caa1]",
              footerActionText: "text-white/50",
              identityPreviewText: "text-white/94",
              identityPreviewEditButtonIcon: "text-white/50",
            },
          }}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
