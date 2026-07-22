"use client";

import * as React from "react";

const basePath = "/Duxo";

/**
 * ImageWithBasePath — renders an <img> that resolves through the GitHub Pages
 * base path. Falls back to a muted placeholder on error so the page never
 * shows a broken image icon.
 */
export default function ImageWithBasePath({
  src,
  alt,
  className,
  priority,
  fill,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
}) {
  const [errored, setErrored] = React.useState(false);
  const adjustedSrc = `${basePath}${src}`;

  if (errored) {
    return (
      <div
        className={className}
        style={{
          background: "var(--color-surface-overlay, #1c1c1c)",
          ...(fill
            ? {
                position: "absolute" as const,
                height: "100%",
                width: "100%",
                inset: 0,
              }
            : {}),
        }}
        aria-hidden="true"
      />
    );
  }

  const style = fill
    ? { position: "absolute" as const, height: "100%", width: "100%", inset: 0, objectFit: "cover" as const }
    : undefined;
  return (
    <img
      src={adjustedSrc}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      style={style}
      onError={() => setErrored(true)}
    />
  );
}
