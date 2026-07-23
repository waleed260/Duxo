"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error("[GlobalError]", error.name, error.message, error.digest);
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-base text-text-primary antialiased">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6">
          <h1 className="text-xl font-weight-emphasis text-danger">
            Unexpected error
          </h1>
          <p className="max-w-md text-center text-sm text-text-secondary">
            {error.message || "The application encountered an unrecoverable error."}
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-pill bg-accent px-6 py-3 text-md text-text-primary hover:bg-accent-hover"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
