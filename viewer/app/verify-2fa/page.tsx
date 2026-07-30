"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Shield, AlertTriangle, KeyRound } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Navbar } from "@/components/Navbar";
import { syncFirebaseAuth, getFirebaseAuth } from "@/lib/auth-bridge";
import { getFirebaseClient } from "@/lib/firebase-client";
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

const totpSessionFlag = { verified: false };

export default function Verify2FAPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [checked, setChecked] = React.useState(false);
  const [totpRequired, setTotpRequired] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [mode, setMode] = React.useState<"totp" | "backup" | "webauthn">("totp");
  const [backupCode, setBackupCode] = React.useState("");
  const [hasPasskey, setHasPasskey] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    async function check() {
      try {
        await syncFirebaseAuth();
      } catch {
        // continue
      }

      const auth = getFirebaseAuth();
      const fbUser = auth.currentUser;
      if (!fbUser) return;

      if (totpSessionFlag.verified) {
        router.replace("/dashboard");
        return;
      }

      const client = getFirebaseClient();
      if (!client) return;
      const { firestore } = client;

      try {
        const userDoc = await getDoc(doc(firestore, "users", fbUser.uid));
        if (!userDoc.exists()) {
          totpSessionFlag.verified = true;
          router.replace("/dashboard");
          return;
        }

        const data = userDoc.data();
        if (!data.totpEnabled || !data.totpSecretEncrypted) {
          totpSessionFlag.verified = true;
          router.replace("/dashboard");
          return;
        }

        setTotpRequired(true);

        try {
          const creds = await loadCredentials(fbUser.uid);
          setHasPasskey(creds.length > 0);
          if (creds.length > 0) setMode("webauthn");
        } catch {
          // non-fatal
        }
      } catch (e) {
        console.error("TOTP check failed:", e);
        totpSessionFlag.verified = true;
        router.replace("/dashboard");
      }

      setChecked(true);
    }

    check();
  }, [user, isLoaded, router]);

  async function handleVerify() {
    const auth = getFirebaseAuth();
    const fbUser = auth.currentUser;
    if (!fbUser || code.length !== 6) return;
    setError(null);
    setVerifying(true);

    try {
      const client = getFirebaseClient();
      if (!client) return;
      const { firestore } = client;
      const userDoc = await getDoc(doc(firestore, "users", fbUser.uid));
      if (!userDoc.exists()) {
        setError("Could not load your security settings.");
        setVerifying(false);
        return;
      }

      const data = userDoc.data();
      const encryptedSecret = data.totpSecretEncrypted as string;
      const secretBase32 = await decryptSecret(encryptedSecret, fbUser.uid);

      const valid = verifyTOTPCode(secretBase32, code);
      if (!valid) {
        setError("That code isn't valid — check your authenticator app and try again.");
        setVerifying(false);
        return;
      }

      totpSessionFlag.verified = true;
      router.replace("/dashboard");
    } catch (e) {
      console.error("TOTP verify failed:", e);
      setError("Something went wrong. Please try again.");
      setVerifying(false);
    }
  }

  async function handleBackup() {
    const auth = getFirebaseAuth();
    const fbUser = auth.currentUser;
    if (!fbUser || backupCode.length < 8) return;
    setError(null);
    setVerifying(true);

    try {
      const client = getFirebaseClient();
      if (!client) return;
      const { firestore } = client;
      const userDoc = await getDoc(doc(firestore, "users", fbUser.uid));
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

      const newHashes = [...hashes];
      newHashes.splice(idx, 1);

      await updateDoc(doc(firestore, "users", fbUser.uid), {
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
    const auth = getFirebaseAuth();
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    setError(null);
    setVerifying(true);

    try {
      const creds = await loadCredentials(fbUser.uid);
      if (creds.length === 0) {
        setError("No passkeys registered. Use a TOTP code or backup code instead.");
        setVerifying(false);
        return;
      }

      const result = await authenticateWithPasskey(creds);
      await updateCredentialCounter(fbUser.uid, result.credentialId, 0);

      totpSessionFlag.verified = true;
      router.replace("/dashboard");
    } catch (e) {
      console.error("WebAuthn verify failed:", e);
      setError("Passkey authentication failed. Try again or use a code.");
      setVerifying(false);
    }
  }

  if (!isLoaded || !checked || !totpRequired) {
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
                {user?.emailAddresses?.[0]?.emailAddress}
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
            <span className="text-xs text-text-secondary">
              Two-factor authentication is managed by Duxo&apos;s built-in
              security layer. For account-level 2FA, visit your{" "}
              <a href="https://clerk.com" className="underline hover:text-text-primary">
                Clerk dashboard
              </a>
              .
            </span>
          </div>
        </div>
      </main>
    </>
  );
}
