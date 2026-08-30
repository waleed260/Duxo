import { NextResponse } from "next/server";

/**
 * Deployment health and configuration check.
 *
 * Railway builds and starts the app happily with an empty environment. Every
 * failure that causes then shows up later and somewhere else: a missing
 * FIREBASE_PRIVATE_KEY is an opaque 500 from /api/resolve-code the first time
 * someone types a session code, and a missing TURN credential is a session
 * that connects for most people and silently fails for the ~10-15% behind a
 * symmetric NAT (§0.8). Neither points at the deployment that caused it.
 *
 * So this reports whether each required variable is *present*. It never
 * returns a value, or any prefix of one — the point is to tell a misconfigured
 * deploy from a working one, not to read secrets back out over HTTP.
 */

export const dynamic = "force-dynamic";

/** Server-side secrets. Absent → the API routes fail at request time. */
const REQUIRED_SERVER = [
  "CLERK_SECRET_KEY",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
] as const;

/** Baked into the client bundle at build time, not read at runtime. */
const REQUIRED_CLIENT = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
] as const;

/**
 * NEXT_PUBLIC_FIREBASE_DATABASE_URL is deliberately *not* required.
 *
 * `lib/firebase-client.ts` derives Firebase's default instance from the
 * project id when it is absent, so a deployment without it still reaches the
 * database. It is only load-bearing for a non-default RTDB region, where the
 * derived `<project>-default-rtdb.firebaseio.com` would be the wrong host.
 *
 * Listing it as required cost more than it saved: it reported a healthy
 * deployment as misconfigured, which is exactly the false alarm that teaches
 * people to stop reading this endpoint.
 */
function databaseUrl(): { url: string | null; derived: boolean } {
  const explicit = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim();
  if (explicit) return { url: explicit, derived: false };
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  return projectId
    ? { url: `https://${projectId}-default-rtdb.firebaseio.com`, derived: true }
    : { url: null, derived: false };
}

/**
 * §0.8 — TURN is not optional, but its absence degrades rather than breaks,
 * so it is reported separately: a deploy missing only this is "up but will
 * fail for some callers", which is a different answer from "misconfigured".
 */
const REQUIRED_TURN = [
  "NEXT_PUBLIC_METERED_TURN_URLS",
  "NEXT_PUBLIC_METERED_TURN_USERNAME",
  "NEXT_PUBLIC_METERED_TURN_CREDENTIAL",
] as const;

function missingFrom(names: readonly string[]): string[] {
  return names.filter((name) => {
    const value = process.env[name];
    return value === undefined || value.trim() === "";
  });
}

export async function GET() {
  const missingServer = missingFrom(REQUIRED_SERVER);
  const missingClient = missingFrom(REQUIRED_CLIENT);
  const missingTurn = missingFrom(REQUIRED_TURN);
  const database = databaseUrl();

  const configured =
    missingServer.length === 0 && missingClient.length === 0 && database.url !== null;

  return NextResponse.json(
    {
      status: configured ? "ok" : "misconfigured",
      // Named, not valued. Knowing CLERK_SECRET_KEY is unset is what makes
      // this useful; knowing any part of it would make this a leak.
      missing: {
        server: missingServer,
        client: missingClient,
        turn: missingTurn,
      },
      // §0.8 — up, but relay-less: fine on most networks, broken on some.
      turnConfigured: missingTurn.length === 0,
      // The host it will actually talk to, and whether that was configured or
      // inferred. Inferred is correct for a default-region database and wrong
      // for any other, so it is worth saying which one happened.
      databaseUrl: database.url,
      databaseUrlDerived: database.derived,
    },
    {
      // A misconfigured deploy must not read as healthy to a load balancer or
      // an uptime check — that is precisely the state worth being paged for.
      status: configured ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
