import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * §3.3 — screen flow: Landing → Login → Dashboard.
 *
 * The authed half of the app (§3.4) is gated here. `auth().protect()` on its
 * own answers an unauthenticated page request with a bare 404, which reads as
 * a broken link rather than "you need to sign in" — so we send visitors to
 * /login and carry the original path back for the post-login redirect.
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

export default clerkMiddleware(async (auth, req) => {
  if (!isProtectedRoute(req)) return;

  if (!(await auth()).userId) {
    const signIn = new URL("/login", req.url);
    signIn.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(signIn);
  }
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
