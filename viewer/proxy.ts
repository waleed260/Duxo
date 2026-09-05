import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { TWO_FACTOR_COOKIE, verifyTwoFactorToken } from "@/lib/two-factor";

/**
 * §3.3 — screen flow: Landing → Login → Dashboard.
 *
 * The authed half of the app (§3.4) is gated here. `auth().protect()` on its
 * own answers an unauthenticated page request with a bare 404, which reads as
 * a broken link rather than "you need to sign in" — so we send visitors to
 * /login and carry the original path back for the post-login redirect.
 *
 * §2.3 — the second factor is enforced here too, and that is the point.
 * /verify-2fa used to set a module-level boolean in the browser and navigate
 * to /dashboard; this file only ever checked for a Clerk session, so
 * requesting /dashboard directly skipped the page entirely and the second
 * factor was decorative. A gate the client can walk around is not a gate.
 */
const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/settings(.*)",
  "/history(.*)",
  "/session(.*)",
  "/verify-2fa(.*)",
  // Pairing mints a Firebase credential for the caller's own uid, so it must
  // never be reachable without a session.
  "/link-device(.*)",
]);

/**
 * Routes that need a session but must stay reachable *without* a proven second
 * factor — otherwise the only way to satisfy the check would be to have
 * already satisfied it.
 *
 * /verify-2fa is the challenge page. The api/totp and api/webauthn routes are
 * how it is answered, and they do their own Clerk check. /settings is here
 * deliberately: locking someone out of the page that manages their factors,
 * because they cannot produce one, is how a lost phone becomes a lost account.
 */
const isTwoFactorExempt = createRouteMatcher([
  "/verify-2fa(.*)",
  "/settings(.*)",
  "/api/totp(.*)",
  "/api/webauthn(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return;

  const { userId, sessionClaims } = await auth();

  if (!userId) {
    const signIn = new URL("/login", req.url);
    signIn.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }

  if (isTwoFactorExempt(req)) return;

  // Whether 2FA is on rides on the Clerk session rather than Firestore:
  // middleware runs in the edge runtime, where firebase-admin cannot follow.
  // /api/totp/activate is what sets this claim.
  const metadata = sessionClaims?.publicMetadata as
    | { twoFactorEnabled?: unknown }
    | undefined;
  if (metadata?.twoFactorEnabled !== true) return;

  // The proof is an HttpOnly cookie the page cannot read or forge, signed
  // server-side and bound to this uid. Anything unverifiable — missing,
  // expired, tampered, or issued for a different user — falls through to the
  // challenge rather than being given the benefit of the doubt.
  const proven = await verifyTwoFactorToken(
    req.cookies.get(TWO_FACTOR_COOKIE)?.value,
    userId,
  );
  if (proven) return;

  const challenge = new URL("/verify-2fa", req.url);
  challenge.searchParams.set(
    "redirect_url",
    req.nextUrl.pathname + req.nextUrl.search,
  );
  return NextResponse.redirect(challenge);
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
