import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { getFirestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { takeChallenge, relyingParty } from "@/lib/webauthn-server";
import {
  issueTwoFactorToken,
  twoFactorCookieOptions,
  TWO_FACTOR_COOKIE,
  TWO_FACTOR_TTL_SECONDS,
} from "@/lib/two-factor";

/**
 * §8.1 — verify a WebAuthn ceremony. This is the half that was missing.
 *
 * The previous client-only flow checked that the returned credential id
 * appeared in a list the caller had just supplied, and called that
 * authentication. A credential id is a public identifier, so it proved
 * nothing: the private key was never exercised, the challenge was never
 * checked, and the signature counter was written back as a literal 0 on every
 * success, defeating clone detection twice over.
 *
 * Everything that makes an assertion mean something happens here, server-side,
 * against a challenge this server issued and remembers:
 *   - the signature, against the stored public key;
 *   - the challenge, which is consumed on read so it cannot be replayed;
 *   - the origin and rpID, against an allowlist rather than the request;
 *   - the signature counter, which must advance.
 *
 * The uid comes from the Clerk session, never the body.
 */
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { mode?: unknown; response?: unknown; deviceName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request" }, { status: 400 });
  }

  const { mode, response } = body;
  if (mode !== "register" && mode !== "authenticate") {
    return NextResponse.json({ error: "Unknown ceremony" }, { status: 400 });
  }
  if (!response || typeof response !== "object") {
    return NextResponse.json({ error: "Missing ceremony response" }, { status: 400 });
  }

  const rp = relyingParty(request);
  if (!rp) {
    return NextResponse.json(
      { error: "Origin not permitted for WebAuthn" },
      { status: 400 },
    );
  }

  // Consumed on read: a replay of the same assertion finds nothing here.
  const expectedChallenge = takeChallenge(userId, mode);
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "No ceremony in progress, or it expired. Start again." },
      { status: 400 },
    );
  }

  const db = getFirestore(getFirebaseAdmin());
  const credentials = db.collection("users").doc(userId).collection("webauthn");

  try {
    if (mode === "register") {
      const verification = await verifyRegistrationResponse({
        response: response as never,
        expectedChallenge,
        expectedOrigin: rp.origin,
        expectedRPID: rp.rpID,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        return NextResponse.json({ error: "Registration failed" }, { status: 400 });
      }

      const { credential } = verification.registrationInfo;
      const deviceName =
        typeof body.deviceName === "string" && body.deviceName.trim()
          ? body.deviceName.trim().slice(0, 120)
          : "Unnamed device";

      // The public key is stored base64url'd because Firestore has no bytes
      // type that survives the client SDK round-trip cleanly, and the verify
      // step below decodes it back.
      await credentials.doc(credential.id).set({
        id: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceName,
        createdAt: Date.now(),
      });

      return NextResponse.json({ verified: true, credentialId: credential.id, deviceName });
    }

    // ── authenticate ──────────────────────────────────────────────────────
    const credentialId = (response as { id?: unknown }).id;
    if (typeof credentialId !== "string") {
      return NextResponse.json({ error: "Malformed assertion" }, { status: 400 });
    }

    const doc = await credentials.doc(credentialId).get();
    if (!doc.exists) {
      // Not "unknown credential" — that would confirm which ids exist on an
      // account to anyone who can reach this route.
      return NextResponse.json({ error: "Authentication failed" }, { status: 400 });
    }
    const stored = doc.data() as {
      publicKey: string;
      counter: number;
      transports?: string[];
    };

    const verification = await verifyAuthenticationResponse({
      response: response as never,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: credentialId,
        publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
        counter: stored.counter ?? 0,
        transports: stored.transports as never,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 400 });
    }

    // §8.1 — the counter must advance. A repeat or a regression means the
    // credential has been cloned, and the library reports it by refusing
    // above; persisting the new value is what keeps that check meaningful
    // next time. The old code wrote 0 here unconditionally, which made every
    // subsequent assertion look like a fresh authenticator.
    await credentials.doc(credentialId).update({
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: Date.now(),
    });

    // A passkey is a second factor too, so a successful assertion earns the
    // same proof cookie a TOTP code does. Without this, passing the WebAuthn
    // challenge would leave the middleware still redirecting to /verify-2fa.
    const token = await issueTwoFactorToken(userId);
    const ok = NextResponse.json({ verified: true, credentialId });
    if (token) {
      ok.cookies.set(TWO_FACTOR_COOKIE, token, twoFactorCookieOptions(TWO_FACTOR_TTL_SECONDS));
    }
    return ok;
  } catch (error) {
    // Library errors here are verification failures (bad signature, wrong
    // origin, malformed attestation), not server faults — reporting 500 would
    // read as "try again" for something that will never succeed.
    console.error("WebAuthn verification failed:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }
}
