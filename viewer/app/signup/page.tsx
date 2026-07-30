"use client";

import { SignUp } from "@clerk/nextjs";
import { Navbar } from "@/components/Navbar";

export default function SignUpPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-60px)] w-full max-w-md flex-col justify-center px-6 py-8">
        <div className="w-full max-w-md">
          <SignUp
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "bg-surface-raised border border-border-default shadow-none",
                headerTitle: "text-text-primary font-sans",
                headerSubtitle: "text-text-secondary",
                socialButtonsBlockButton:
                  "bg-surface-overlay border-border-default text-text-primary",
                formFieldLabel: "text-text-secondary",
                formFieldInput:
                  "bg-surface-overlay border-border-default text-text-primary",
                footerActionLink: "text-accent hover:text-accent-hover",
                formButtonPrimary: "bg-accent hover:bg-accent-hover text-white",
              },
            }}
          />
        </div>
      </main>
    </>
  );
}
