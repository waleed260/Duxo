import { initializeApp, getApps, cert } from "firebase-admin/app";

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

const firebaseAdminConfig = {
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID!,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
  databaseURL: resolveDatabaseUrl(),
};

export const firebaseAdmin =
  getApps().length === 0 ? initializeApp(firebaseAdminConfig) : getApps()[0];
