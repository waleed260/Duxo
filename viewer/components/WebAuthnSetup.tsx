/**
 * §8.1 — WebAuthn setup component for registering and managing passkeys.
 * Users can register biometric 2FA (fingerprint, Face ID, Windows Hello)
 * as an alternative to TOTP codes during login verification.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  Fingerprint,
  Trash2,
  Smartphone,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  registerPasskey,
  loadCredentials,
  deleteCredential,
  storeCredential,
  WebAuthnCredential,
} from "@/lib/webauthn";

interface WebAuthnSetupProps {
  uid: string;
}

export function WebAuthnSetup({ uid }: WebAuthnSetupProps) {
  const [credentials, setCredentials] = useState<WebAuthnCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  const refreshCredentials = useCallback(async () => {
    try {
      const creds = await loadCredentials(uid);
      setCredentials(creds);
    } catch {
      // Non-fatal — may simply have no webauthn subcollection yet.
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    refreshCredentials();
  }, [refreshCredentials]);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const deviceName = `${
        navigator.platform || "Unknown device"
      } (${new Date().toLocaleDateString()})`;
      const credential = await registerPasskey(uid, deviceName);
      await storeCredential(uid, credential);
      await refreshCredentials();
      toast.success("Passkey registered successfully", {
        description: "You can now use biometric 2FA during login.",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      toast.error("Passkey registration failed", { description: message });
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (credentialId: string) => {
    try {
      await deleteCredential(uid, credentialId);
      setCredentials((prev) => prev.filter((c) => c.id !== credentialId));
      toast.success("Passkey removed");
    } catch {
      toast.error("Failed to remove passkey");
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-5 w-5" />
            Passkeys (Biometric 2FA)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-4 w-4 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5" />
          Passkeys (Biometric 2FA)
        </CardTitle>
        <CardDescription>
          Register a passkey for passwordless biometric 2FA using fingerprint,
          Face ID, Windows Hello, or a security key. Can be used alongside or
          instead of TOTP authenticator codes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {credentials.length === 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-muted p-3 text-sm text-muted-foreground">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No passkeys registered yet. Add one for faster 2FA during login.
            </span>
          </div>
        )}

        {credentials.length > 0 && (
          <div className="space-y-2">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{cred.deviceName}</p>
                    <p className="text-xs text-muted-foreground">
                      Registered {new Date(cred.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(cred.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          onClick={handleRegister}
          disabled={registering}
          className="w-full"
        >
          {registering ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Registering passkey…
            </>
          ) : (
            <>
              <Fingerprint className="mr-2 h-4 w-4" />
              Register a Passkey
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
