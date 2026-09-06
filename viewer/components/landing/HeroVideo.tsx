"use client";

import * as React from "react";

/**
 * Hero background footage.
 *
 * Self-hosted from /public rather than pulled from the CDN it was rendered
 * on: the CSP in app/layout.tsx has no `media-src` directive, so media falls
 * back to `default-src 'self'` and any third-party origin is blocked
 * outright. Serving it same-origin keeps the policy untouched.
 *
 * Client-side only because of the reduced-motion contract. A looping
 * background video is decoration, and a viewer who has asked the OS for less
 * motion should not be handed a 20-second loop they cannot stop — CSS cannot
 * pause a video, so the preference is read here and the element is paused and
 * parked on its first frame. The listener stays attached because the
 * preference can be toggled while the page is open.
 */
export function HeroVideo() {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const apply = () => {
      if (query.matches) {
        video.pause();
        // Park on a frame with the portal lit rather than on black.
        try {
          video.currentTime = 0;
        } catch {
          /* seeking before metadata lands is not worth handling */
        }
      } else {
        // A rejected play() is normal (battery saver, a background tab); the
        // poster-less black plate underneath is the intended fallback.
        void video.play().catch(() => {});
      }
    };

    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <video
      ref={ref}
      className="cine-video"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
      tabIndex={-1}
    >
      <source src="/hero-portal.mp4" type="video/mp4" />
    </video>
  );
}
