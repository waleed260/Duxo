import { initializeApp, getApps, cert, type App } from "firebase-admin/app";

/**
 * `databaseURL` is required for `getDatabase(firebaseAdmin)` — the device
 * pairing route reads and writes the RTDB `pairings` node server-side, and
 * without it the Admin SDK throws "Can't determine Firebase Database URL".
 * Falls back to Firebase's default instance name, matching the client-side
 * resolution in firebase-client.ts.
 */
function resolveDatabaseUrl(): string | undefined {
  const explicit =
    process.env.FIREBASE_DATABASE_URL ??
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (explicit) return explicit;
  const projectId =
    process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined;
}

let cached: App | null = null;

/**
 * The Admin app, built on first use.
 *
 * Deliberately a function rather than an exported `const`. Initialising at
 * module scope meant `cert()` parsed `FIREBASE_PRIVATE_KEY` the moment
 * anything imported this file — and Next evaluates every route module during
 * `next build` to collect page data. So a missing or malformed private key
 * did not produce a route that fails when called; it failed the *build*, with
 * "Failed to collect page data for /api/resolve-code" and a decoder error
 * underneath it.
 *
 * That defeats the design the rest of the deployment rests on: `/api/health`
 * exists to tell a misconfigured deploy from a working one, and Railway
 * health-checks it precisely so a bad environment fails the deploy loudly
 * instead of replacing a working instance. None of that can happen if the
 * build dies first. It also meant the app could not be built at all without
 * production credentials, which is why CI never built it.
 */
export function getFirebaseAdmin(): App {
  if (cached) return cached;
  const existing = getApps();
  cached =
    existing.length > 0
      ? existing[0]
      : initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID!,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          }),
          databaseURL: resolveDatabaseUrl(),
        });
  return cached;
}
