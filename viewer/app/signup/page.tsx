"use client";

import { SignUp } from "@clerk/nextjs";
import { LightNav } from "@/components/landing/LightNav";
import { LightFooter } from "@/components/landing/LightFooter";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-white text-[#121211] antialiased" style={{ colorScheme: "light" }}>
      <LightNav alwaysSolid />
      <main className="mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-md flex-col justify-center px-6 py-24 sm:py-28">
        <SignUp
          routing="hash"
          appearance={{
            variables: {
              colorPrimary: "#000000",
              colorBackground: "#ffffff",
              colorForeground: "#121211",
              colorMutedForeground: "#575551",
              colorInput: "#ffffff",
              colorInputForeground: "#121211",
              colorDanger: "#b3261e",
              borderRadius: "4px",
            },
            elements: {
              rootBox: "mx-auto w-full",
              card: "bg-white border border-black shadow-none rounded-lg p-8",
              headerTitle: "text-black font-medium tracking-[-0.02em]",
              headerSubtitle: "text-[#575551]",
              socialButtonsBlockButton:
                "touch-manipulation bg-white border border-black text-black hover:bg-black hover:text-white transition-colors duration-150 rounded",
              socialButtonsBlockButtonText: "text-[13px] font-medium",
              dividerLine: "bg-black/20",
              dividerText: "text-[#958d7e] text-xs uppercase tracking-[0.08em]",
              formFieldLabel: "text-[#575551] text-sm",
              formFieldInput:
                "bg-white border border-black text-[#121211] rounded focus:border-black focus:ring-1 focus:ring-black",
              formButtonPrimary:
                "touch-manipulation bg-black hover:bg-[#2a2a28] text-white text-xs font-medium uppercase tracking-[0.1em] rounded transition-colors duration-150 normal-case",
              footerActionLink: "text-black underline hover:text-[#575551]",
              footerActionText: "text-[#575551]",
              identityPreviewText: "text-[#121211]",
              identityPreviewEditButtonIcon: "text-[#575551]",
            },
          }}
        />
      </main>
      <LightFooter />
    </div>
  );
}
