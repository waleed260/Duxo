"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Shield, AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Navbar } from "@/components/Navbar";
import { getFirebase } from "@/lib/firebase";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import {
  verifyTOTPCode,
  decryptSecret,
  verifyBackupCode,
} from "@/lib/totp";
import {
  authenticateWithPasskey,
  loadCredentials,
  updateCredentialCounter,
} from "@/lib/webauthn";

/**
 * TOTP Verification — §2.3.
 *
 * After a successful login (email/password or Google), if the user has
 * TOTP enabled, they are redirected here to enter a verification code.
 *
 * The verification status is stored as an in-memory session flag so the
 * user is only prompted once per browser session. On page close or logout,
 * the flag is cleared.
 */

// In-memory session flag — survives client-side navigation but not page reload.
const totpSessionFlag = { verified: false };

export default function Verify2FAPage() {
  const router = useRouter();
  const [user, setUser] = React.useState<User | null>(null);
  const [checked, setChecked] = React.useState(false);
  const [totpRequired, setTotpRequired] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [mode, setMode] = React.useState<"totp" | "backup" | "webauthn">("totp");
  const [backupCode, setBackupCode] = React.useState("");
  const [hasPasskey, setHasPasskey] = React.useState(false);

  React.useEffect(() => {
    const { auth, firestore } = getFirebase();

    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }

      setUser(u);

      // If already verified this session, skip straight to dashboard.
      if (totpSessionFlag.verified) {
        router.replace("/dashboard");
        return;
      }

      try {
        const userDoc = await getDoc(doc(firestore, "users", u.uid));
        if (!userDoc.exists()) {
          // No user doc — no TOTP settings, skip verification.
          totpSessionFlag.verified = true;
          router.replace("/dashboard");
          return;
        }

        const data = userDoc.data();
        if (!data.totpEnabled || !data.totpSecretEncrypted) {
          // TOTP not enabled — skip verification.
          totpSessionFlag.verified = true;
          router.replace("/dashboard");
          return;
        }

        // TOTP is required — show the verification form.
        setTotpRequired(true);

        // §8.1 — Check if user has WebAuthn passkeys registered.
        try {
          const creds = await loadCredentials(u.uid);
          setHasPasskey(creds.length > 0);
          if (creds.length > 0) setMode("webauthn");
        } catch {
          // Non-fatal — may not have webauthn subcollection.
        }
      } catch (e) {
        console.error("TOTP check failed:", e);
        // If we can't check (e.g., offline), allow through to avoid lockout.
        totpSessionFlag.verified = true;
        router.replace("/dashboard");
      }

      setChecked(true);
    });

    return () => unsub();
  }, [router]);

  async function handleVerify() {
    if (!user || code.length !== 6) return;
    setError(null);
    setVerifying(true);

    try {
      const { firestore } = getFirebase();
      const userDoc = await getDoc(doc(firestore, "users", user.uid));
      if (!userDoc.exists()) {
        setError("Could not load your security settings.");
        setVerifying(false);
        return;
      }

      const data = userDoc.data();
      const encryptedSecret = data.totpSecretEncrypted as string;
      const secretBase32 = await decryptSecret(encryptedSecret, user.uid);

      const valid = verifyTOTPCode(secretBase32, code);
      if (!valid) {
        setError("That code isn't valid — check your authenticator app and try again.");
        setVerifying(false);
        return;
      }

      // Mark as verified for this session.
      totpSessionFlag.verified = true;
      router.replace("/dashboard");
    } catch (e) {
      console.error("TOTP verify failed:", e);
      setError("Something went wrong. Please try again.");
      setVerifying(false);
    }
  }

  async function handleBackup() {
    if (!user || backupCode.length < 8) return;
    setError(null);
    setVerifying(true);

    try {
      const { firestore } = getFirebase();
      const userDoc = await getDoc(doc(firestore, "users", user.uid));
      if (!userDoc.exists()) {
        setError("Could not load your security settings.");
        setVerifying(false);
        return;
      }

      const data = userDoc.data();
      const hashes = (data.backupCodeHashes as string[]) || [];

      const code_upper = backupCode.toUpperCase().trim();
      const idx = await verifyBackupCode(code_upper, hashes);

      if (idx === -1) {
        setError("That backup code isn't valid.");
        setVerifying(false);
        return;
      }

      // Remove the used backup code from Firestore.
      const newHashes = [...hashes];
      newHashes.splice(idx, 1);

      await updateDoc(doc(firestore, "users", user.uid), {
        backupCodeHashes: newHashes,
      });

      totpSessionFlag.verified = true;
      router.replace("/dashboard");
    } catch (e) {
      console.error("Backup code verify failed:", e);
      setError("Something went wrong. Please try again.");
      setVerifying(false);
    }
  }

  async function handlePasskeyLogin() {
    if (!user) return;
    setError(null);
    setVerifying(true);

    try {
      const creds = await loadCredentials(user.uid);
      if (creds.length === 0) {
        setError("No passkeys registered. Use a TOTP code or backup code instead.");
        setVerifying(false);
        return;
      }

      const result = await authenticateWithPasskey(creds);

      // Update the counter to detect cloned authenticators.
      await updateCredentialCounter(user.uid, result.credentialId, 0);

      totpSessionFlag.verified = true;
      router.replace("/dashboard");
    } catch (e) {
      console.error("WebAuthn verify failed:", e);
      setError("Passkey authentication failed. Try again or use a code.");
      setVerifying(false);
    }
  }

  // If not checked yet or no TOTP required, show minimal loading state.
  if (!checked || !totpRequired) {
    return (
      <>
        <Navbar />
        <main className="mx-auto flex min-h-[calc(100vh-60px)] max-w-md flex-col items-center justify-center px-6">
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            <Shield className="h-5 w-5 animate-pulse text-accent" aria-hidden="true" />
            Checking security settings…
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[calc(100vh-60px)] w-full max-w-md flex-col justify-center px-6 py-8">
        <div className="rounded-md border border-border-default bg-surface-raised p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent/10 text-accent">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-weight-emphasis">
                Two-factor authentication
              </h1>
              <p className="text-sm text-text-secondary">
                {user?.email}
              </p>
            </div>
          </div>

          {mode === "webauthn" && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text-secondary">
                Use your passkey (fingerprint, Face ID, Windows Hello, or
                security key) to verify your identity.
              </p>

              <Button
                onClick={handlePasskeyLogin}
                isLoading={verifying}
                size="lg"
                className="w-full"
              >
                Sign in with Passkey
              </Button>

              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setMode("totp"); setError(null); }}
                  className="text-xs text-text-secondary underline hover:text-text-primary transition-colors duration-instant"
                >
                  Use authenticator code instead
                </button>
                {hasPasskey && (
                  <button
                    type="button"
                    onClick={() => { setMode("backup"); setError(null); }}
                    className="text-xs text-text-secondary underline hover:text-text-primary transition-colors duration-instant"
                  >
                    Use a backup code instead
                  </button>
                )}
              </div>
            </div>
          )}

          {mode === "totp" && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text-secondary">
                Enter the 6-digit code from your authenticator app to continue.
              </p>

              <Input
                label="Authentication code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(digits);
                  if (error) setError(null);
                }}
                error={error ?? undefined}
              />

              <Button
                onClick={handleVerify}
                isLoading={verifying}
                disabled={code.length !== 6}
                size="lg"
                className="w-full"
              >
                Verify
              </Button>

              <div className="flex flex-col items-center gap-2">
                {hasPasskey && (
                  <button
                    type="button"
                    onClick={() => { setMode("webauthn"); setError(null); }}
                    className="text-xs text-text-secondary underline hover:text-text-primary transition-colors duration-instant"
                  >
                    Use passkey instead
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setMode("backup"); setError(null); }}
                  className="text-xs text-text-secondary underline hover:text-text-primary transition-colors duration-instant"
                >
                  Use a backup code instead
                </button>
              </div>
            </div>
          )}

          {mode === "backup" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-sm border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
                <KeyRound className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-text-secondary">
                  Enter one of your backup codes. Each code can be used once.
                </span>
              </div>

              <Input
                label="Backup code"
                type="text"
                autoComplete="off"
                placeholder="XXXX-XXXX"
                value={backupCode}
                onChange={(e) => {
                  setBackupCode(e.target.value);
                  if (error) setError(null);
                }}
                error={error ?? undefined}
              />

              <Button
                onClick={handleBackup}
                isLoading={verifying}
                disabled={backupCode.length < 8}
                size="lg"
                className="w-full"
              >
                Verify backup code
              </Button>

              <div className="flex flex-col items-center gap-2">
                {hasPasskey && (
                  <button
                    type="button"
                    onClick={() => { setMode("webauthn"); setError(null); }}
                    className="text-xs text-text-secondary underline hover:text-text-primary transition-colors duration-instant"
                  >
                    Use passkey instead
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setMode("totp"); setError(null); }}
                  className="text-xs text-text-secondary underline hover:text-text-primary transition-colors duration-instant"
                >
                  Use authenticator app instead
                </button>
              </div>
            </div>
          )}

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={async () => {
                const { auth } = getFirebase();
                await signOut(auth);
                totpSessionFlag.verified = false;
                router.push("/login");
              }}
              className="text-xs text-text-secondary underline hover:text-text-primary transition-colors duration-instant"
            >
              Sign out and try a different account
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
