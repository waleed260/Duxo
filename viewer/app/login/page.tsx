"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getFirebase } from "@/lib/firebase";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  type AuthError,
} from "firebase/auth";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Navbar } from "@/components/Navbar";

/**
 * Duxo login/signup — §2.2 + §3.4.
 *
 * §3.4 — Google OAuth primary (single click, no password friction);
 * email/password secondary below a divider. TOTP 2FA offered AFTER first
 * login, not forced during signup (reduces friction).
 *
 * §2.2 — password policy: ≥10 chars + not in common-passwords list.
 * §2.2 — emailVerified enforced before hosting (enforced on host side).
 */

const COMMON_PASSWORDS = new Set([
  "password", "12345678", "qwerty123", "letmein123", "abc1234567",
  "password12", "iloveyou1", "admin12345", "welcome123",
  // Truncated top-10K list — bundled in-app, no paid API (§2.2).
]);

function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return "That password is too common — choose something unique.";
  }
  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = React.useState<"login" | "signup">("login");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<"google" | "email" | null>(null);

  async function handleGoogle() {
    setError(null);
    setLoading("google");
    try {
      const fb = getFirebase(); if (!fb) return; const { auth } = fb;
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      router.push("/dashboard");
    } catch (e) {
      setError(formatAuthError(e as AuthError));
      setLoading(null);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      const pwErr = validatePassword(password);
      if (pwErr) {
        setError(pwErr);
        return;
      }
    }

    setLoading("email");
    try {
      const fb = getFirebase(); if (!fb) return; const { auth } = fb;
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        // §2.2 — verification required before hosting. Not blocking viewing.
        await sendEmailVerification(cred.user);
        router.push("/dashboard");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        router.push("/dashboard");
      }
    } catch (e) {
      setError(formatAuthError(e as AuthError));
      setLoading(null);
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-60px)] w-full max-w-md flex-col justify-center px-6 py-8">
        <div className="rounded-md border border-border-default bg-surface-raised p-6">
          <h1 className="mb-2 text-xl font-weight-emphasis">
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mb-5 text-sm text-text-secondary">
            Sign in to connect to or host a remote machine.
          </p>

          {/* §3.4 — Google OAuth primary */}
          <Button
            className="w-full"
            size="lg"
            onClick={handleGoogle}
            isLoading={loading === "google"}
            // aria-label included even though there's a visible label,
            // for the icon-leading case.
            aria-label="Continue with Google"
          >
            Continue with Google
          </Button>

          {/* §3.4 — email/password secondary below a divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border-default" />
            <span className="text-xs text-text-secondary">or</span>
            <div className="h-px flex-1 bg-border-default" />
          </div>

          <form onSubmit={handleEmail} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={error ?? undefined}
              hint={
                mode === "signup"
                  ? "At least 10 characters, not a common password."
                  : undefined
              }
            />
            <Button
              type="submit"
              className="w-full"
              size="lg"
              isLoading={loading === "email"}
            >
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="mt-5 text-center text-sm text-text-secondary">
            {mode === "login" ? (
              <>
                New to Duxo?{" "}
                <button
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className="text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-primary focus-visible:outline-offset-2"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className="text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-text-primary focus-visible:outline-offset-2"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-text-secondary">
          By continuing you agree to our{" "}
          <Link href="/#docs" className="underline hover:text-text-primary">
            terms
          </Link>
          . Tokens are kept in memory only — never persisted to disk.
        </p>
      </main>
    </>
  );
}

function formatAuthError(e: AuthError): string {
  // §9.6 — plain language, never raw codes like "auth/wrong-password".
  switch (e.code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Wrong email or password — try again.";
    case "auth/email-already-in-use":
      return "An account with that email already exists.";
    case "auth/weak-password":
      return "Choose a stronger password (at least 10 characters).";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/too-many-requests":
      return "Too many attempts — wait a moment and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}
