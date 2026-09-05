/**
 * Duxo — Firebase client initialization (viewer side).
 *
 * Reads config from env (never commit real keys). Spark plan covers
 * Auth + RTDB + Firestore with no card required (§0.3 Path A).
 *
 * IMPORTANT — §2.5: ID tokens live in memory only. Never localStorage.
 * The viewer keeps the token in memory and includes it in the RTDB session
 * request; the host agent verifies the JWT signature locally (§2.5).
 */
import { getFirebaseClient } from "./firebase-client";

/**
 * Thin alias over getFirebaseClient, kept because lib/webauthn.ts imports
 * this name.
 *
 * This module used to be a second, near-identical copy of firebase-client:
 * its own `initializeApp`, its own singletons, its own config block. Two
 * copies meant two different auth configurations against the same app, and
 * this one's was the unsafe pair — it called `setPersistence(auth,
 * browserSessionPersistence)` and, on failure, fell back to
 * `browserLocalPersistence`, which is the localStorage the header above
 * says must never hold a token. Both calls were fire-and-forget, so a
 * sign-in could beat them to the default persistence regardless.
 *
 * Delegating means one app, one auth instance, one persistence decision,
 * made at construction in firebase-client.
 */
export function getFirebase() {
  return getFirebaseClient();
}
