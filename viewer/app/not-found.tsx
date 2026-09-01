import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";

/**
 * There was no not-found.tsx, so a mistyped URL fell through to Next's
 * built-in 404: an unstyled white page with "404 | This page could not be
 * found". On a dark-first app (§9.1) that is a full-brightness flash and no
 * navigation at all — it reads as the site being broken rather than the
 * address being wrong, and leaves nowhere to go but the back button.
 *
 * The two ways someone actually arrives here are a stale link to a page that
 * moved and a typo in a hand-copied URL, so this offers the two destinations
 * that answer both: the landing page and the download.
 */
export const metadata: Metadata = {
  title: "Page not found — Duxo",
  // A 404 body is not a page anyone should reach from search results.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-start justify-center px-6 py-16">
        <p className="font-mono text-sm tracking-[0.2em] text-text-secondary">
          404
        </p>
        <h1 className="mt-3 text-2xl font-emphasis text-text-primary">
          That page isn&rsquo;t here.
        </h1>
        <p className="mt-3 text-md text-text-secondary">
          The link may be out of date, or the address may have a typo in it.
          Nothing is wrong with your connection or with Duxo.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="primary">
            <Link href="/">Back to the home page</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/download">Download the host agent</Link>
          </Button>
        </div>

        <p className="mt-8 text-sm text-text-secondary">
          Looking for a session? Codes are entered on your{" "}
          <Link
            href="/dashboard"
            className="text-text-primary underline underline-offset-2"
          >
            dashboard
          </Link>
          , not in the address bar.
        </p>
      </main>
      <Footer />
    </>
  );
}
