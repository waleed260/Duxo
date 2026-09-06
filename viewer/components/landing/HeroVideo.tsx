"use client";

import * as React from "react";

/** `navigator.connection` is not in lib.dom yet. */
type ConnectionInfo = { saveData?: boolean };

/**
 * Hero background footage.
 *
 * Self-hosted from /public rather than pulled from the CDN it was rendered
 * on: the CSP in app/layout.tsx has no `media-src` directive, so media falls
 * back to `default-src 'self'` and any third-party origin is blocked
 * outright. Serving it same-origin keeps the policy untouched.
 *
 * The element is deliberately NOT declarative. It carries `preload="none"`
 * and no `autoplay`, and this effect decides whether the 5MB file is worth
 * fetching at all:
 *
 *  - `prefers-reduced-motion: reduce` — a looping background video is pure
 *    decoration, and CSS cannot pause a video. The listener stays attached
 *    so toggling the preference mid-session takes effect.
 *  - `navigator.connection.saveData` — someone on a metered connection
 *    should not spend 5MB on ambience.
 *
 * In both cases the poster stands in and the video is never requested. That
 * is also what a no-JS visitor gets: a still frame of the same shot rather
 * than a blank plate, which is why losing declarative autoplay is an
 * acceptable trade here.
 */
export function HeroVideo() {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: ConnectionInfo })
      .connection;

    const apply = () => {
      if (motion.matches || connection?.saveData) {
        video.pause();
        return;
      }

      if (video.preload !== "auto") {
        video.preload = "auto";
        video.load();
      }

      // A rejected play() is normal — a background tab, battery saver, a
      // policy this build does not know about. The poster is the fallback.
      void video.play().catch(() => {});
    };

    apply();
    motion.addEventListener("change", apply);
    return () => motion.removeEventListener("change", apply);
  }, []);

  return (
    <video
      ref={ref}
      className="cine-video"
      poster="/hero-portal-poster.jpg"
      preload="none"
      muted
      loop
      playsInline
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src="/hero-portal.mp4" type="video/mp4" />
    </video>
  );
}
