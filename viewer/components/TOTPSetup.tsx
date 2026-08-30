"use client";

import * as React from "react";
import {
  Shield,
  Smartphone,
  CheckCircle,
  AlertTriangle,
  Copy,
  ArrowLeft,
  KeyRound,
} from "lucide-react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Card, CardIconBadge } from "@/components/Card";
import { syncFirebaseAuth, getFirebaseAuth } from "@/lib/auth-bridge";
import { getFirebaseClient } from "@/lib/firebase-client";
import { sanitizeSvg } from "@/lib/sanitize";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import {
  generateTOTPSecret,
  generateQRCodeSVG,
  verifyTOTPCode,
  encryptSecret,
  generateBackupCodes,
} from "@/lib/totp";

type SetupPhase = "idle" | "scan" | "verify" | "backup" | "done";

export default function TOTPSetup() {
  const { user, isLoaded } = useUser();
  const [phase, setPhase] = React.useState<SetupPhase>("idle");
  const [totpEnabled, setTotpEnabled] = React.useState(false);
  const [qrSvg, setQrSvg] = React.useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = React.useState("");
  const [secretBase32, setSecretBase32] = React.useState("");
  const [verificationCode, setVerificationCode] = React.useState("");
  const [verifyError, setVerifyError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [backupCodes, setBackupCodes] = React.useState<string[]>([]);
  const [codesCopied, setCodesCopied] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!isLoaded || !user) return;

    async function init() {
      try {
        await syncFirebaseAuth();
      } catch {
        // continue
      }

      const auth = getFirebaseAuth();
      const fbUser = auth.currentUser;
      if (!fbUser) return;

      const client = getFirebaseClient();
      if (!client) return;
      const { firestore } = client;

      try {
        const userDoc = await getDoc(doc(firestore, "users", fbUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setTotpEnabled(data.totpEnabled ?? false);
        }
      } catch (e) {
        console.error("TOTP status check failed:", e);
      }
      setLoading(false);
    }

    init();
  }, [user, isLoaded]);

  async function handleEnable() {
    if (!user?.emailAddresses?.[0]?.emailAddress) return;

    const { secret, otpauthUri: uri } = generateTOTPSecret(
      user.emailAddresses[0].emailAddress,
    );
    setSecretBase32(secret);
    setOtpauthUri(uri);

    try {
      const svg = await generateQRCodeSVG(uri);
      setQrSvg(svg);
      setPhase("scan");
    } catch {
      setPhase("scan");
    }
  }

  async function handleVerify() {
    const auth = getFirebaseAuth();
    const fbUser = auth.currentUser;
    if (!fbUser || verificationCode.length !== 6) return;

    setVerifyError(null);
    setVerifying(true);

    try {
      const isValid = verifyTOTPCode(secretBase32, verificationCode);

      if (!isValid) {
        setVerifyError("That code doesn't match — check your authenticator app and try again.");
        setVerifying(false);
        return;
      }

      const encrypted = await encryptSecret(secretBase32, fbUser.uid);
      const codes = await generateBackupCodes();
      const backupCodeHashes = codes.map((c) => c.hash);

      const client = getFirebaseClient();
      if (!client) return;
      const { firestore } = client;
      const userRef = doc(firestore, "users", fbUser.uid);

      const existingDoc = await getDoc(userRef);
      if (existingDoc.exists()) {
        await updateDoc(userRef, {
          totpEnabled: true,
          totpSecretEncrypted: encrypted,
          backupCodeHashes,
        });
      } else {
        await setDoc(userRef, {
          email: fbUser.email,
          displayName: "",
          emailVerified: fbUser.emailVerified,
          createdAt: Date.now(),
          totpEnabled: true,
          totpSecretEncrypted: encrypted,
          backupCodeHashes,
        });
      }

      setBackupCodes(codes.map((c) => c.plaintext));
      setTotpEnabled(true);
      setPhase("backup");
    } catch (e) {
      console.error("TOTP verify/save failed:", e);
      setVerifyError("Something went wrong. Please try again.");
    }

    setVerifying(false);
  }

  function handleBackupDone() {
    setPhase("done");
  }

  function handleCopyCodes() {
    navigator.clipboard.writeText(backupCodes.join("\n")).catch(() => {});
    setCodesCopied(true);
    setTimeout(() => setCodesCopied(false), 2000);
  }

  async function handleDisable() {
    const auth = getFirebaseAuth();
    const fbUser = auth.currentUser;
    if (!fbUser) return;

    const client = getFirebaseClient();
    if (!client) return;
    const { firestore } = client;
    try {
      await updateDoc(doc(firestore, "users", fbUser.uid), {
        totpEnabled: false,
        totpSecretEncrypted: null,
        backupCodeHashes: [],
      });
      setTotpEnabled(false);
      setPhase("idle");
    } catch (e) {
      console.error("TOTP disable failed:", e);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardIconBadge>
          <Shield className="h-5 w-5" />
        </CardIconBadge>
        <div>
          <h2 className="text-lg font-emphasis">Two-factor authentication</h2>
          <p className="mt-1 text-sm text-text-secondary">Loading…</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardIconBadge>
        <Shield className="h-5 w-5" />
      </CardIconBadge>
      <div>
        <h2 className="text-lg font-emphasis">Two-factor authentication</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Add an extra layer of security to your account using a time-based
          one-time password (TOTP) from any authenticator app.
        </p>
      </div>

      <TOTPContent
        phase={phase}
        totpEnabled={totpEnabled}
        qrSvg={qrSvg}
        otpauthUri={otpauthUri}
        verificationCode={verificationCode}
        setVerificationCode={setVerificationCode}
        verifyError={verifyError}
        verifying={verifying}
        backupCodes={backupCodes}
        codesCopied={codesCopied}
        onEnable={handleEnable}
        onVerify={handleVerify}
        onBackupDone={handleBackupDone}
        onCopyCodes={handleCopyCodes}
        onDisable={handleDisable}
        onGoToVerify={() => setPhase("verify")}
        onGoToScan={() => setPhase("scan")}
      />
    </Card>
  );
}

function TOTPContent({
  phase,
  totpEnabled,
  qrSvg,
  otpauthUri,
  verificationCode,
  setVerificationCode,
  verifyError,
  verifying,
  backupCodes,
  codesCopied,
  onEnable,
  onVerify,
  onBackupDone,
  onCopyCodes,
  onDisable,
  onGoToVerify,
  onGoToScan,
}: {
  phase: SetupPhase;
  totpEnabled: boolean;
  qrSvg: string | null;
  otpauthUri: string;
  verificationCode: string;
  setVerificationCode: (v: string) => void;
  verifyError: string | null;
  verifying: boolean;
  backupCodes: string[];
  codesCopied: boolean;
  onEnable: () => void;
  onVerify: () => void;
  onBackupDone: () => void;
  onCopyCodes: () => void;
  onDisable: () => void;
  onGoToVerify: () => void;
  onGoToScan: () => void;
}) {
  if (phase === "done") {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-3 rounded-sm border border-success/30 bg-success/5 px-4 py-3 text-sm">
          <CheckCircle className="h-5 w-5 text-success flex-shrink-0" aria-hidden="true" />
          <span className="text-text-primary font-emphasis">
            Two-factor authentication is active.
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          Your account is now protected with TOTP. Next time you sign in,
          you&apos;ll need a code from your authenticator app.
        </p>
      </div>
    );
  }

  if (totpEnabled) {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-3 rounded-sm border border-success/30 bg-success/5 px-4 py-3 text-sm">
          <CheckCircle className="h-5 w-5 text-success flex-shrink-0" aria-hidden="true" />
          <span className="text-text-primary font-emphasis">
            2FA is enabled
          </span>
        </div>
        <Button variant="ghost" onClick={onDisable}>
          Disable two-factor authentication
        </Button>
      </div>
    );
  }

  if (phase === "idle") {
    return (
      <div className="pt-2">
        <Button onClick={onEnable} leadingIcon={<Smartphone className="h-4 w-4" />}>
          Enable two-factor authentication
        </Button>
      </div>
    );
  }

  if (phase === "scan") {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <p className="text-sm text-text-secondary">
          Scan this QR code with your authenticator app (Google Authenticator,
          Authy, 1Password, or any TOTP-compatible app).
        </p>
        <div className="flex flex-col items-center gap-3 py-3">
          {qrSvg ? (
            <div
              className="h-48 w-48 rounded-sm border border-border-default bg-black p-2"
              dangerouslySetInnerHTML={{ __html: sanitizeSvg(qrSvg) }}
              aria-label="QR code for authenticator app"
            />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center rounded-sm border border-border-default bg-surface-overlay">
              <p className="px-4 text-center text-xs text-text-secondary break-all">
                {otpauthUri}
              </p>
            </div>
          )}
        </div>
        <p className="text-xs text-text-secondary text-center">
          Can&apos;t scan? Manually enter the key in your app using the option
          to add a setup key.
        </p>
        <Button size="md" onClick={onGoToVerify}>
          I&apos;ve scanned the code
        </Button>
      </div>
    );
  }

  if (phase === "verify") {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <ArrowLeft
            className="h-4 w-4 cursor-pointer hover:text-text-primary"
            onClick={onGoToScan}
            aria-label="Back to QR code"
          />
          <span>Enter the 6-digit code from your authenticator app.</span>
        </div>
        <div className="flex flex-col gap-3">
          <Input
            label="Verification code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            value={verificationCode}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
              setVerificationCode(digits);
            }}
            error={verifyError ?? undefined}
          />
          <Button
            onClick={onVerify}
            isLoading={verifying}
            disabled={verificationCode.length !== 6}
          >
            Verify &amp; enable
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "backup") {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <div className="flex items-start gap-3 rounded-sm border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
          <AlertTriangle className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-emphasis text-text-primary">
              Save these backup codes
            </p>
            <p className="mt-1 text-text-secondary">
              Each code can be used once to sign in if you lose access to your
              authenticator app. Store them somewhere safe.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-sm border border-border-default bg-surface-overlay p-4 font-mono text-sm tracking-wider">
          {backupCodes.map((code) => (
            <div key={code} className="flex items-center gap-2 text-text-primary">
              <KeyRound className="h-3 w-3 text-text-secondary flex-shrink-0" aria-hidden="true" />
              <span>{code}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="md"
            leadingIcon={<Copy className="h-4 w-4" />}
            onClick={onCopyCodes}
          >
            {codesCopied ? "Copied!" : "Copy codes"}
          </Button>
          <Button size="md" onClick={onBackupDone}>
            I&apos;ve saved the codes
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
