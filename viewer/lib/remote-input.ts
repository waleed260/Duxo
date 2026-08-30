/**
 * Duxo — viewer-side input capture (§1.2, §1.4).
 *
 * §1.2 — the viewer owns "capturing local mouse/keyboard on the overlay,
 * sending data-channel messages". It owns nothing else: it never decides
 * whether input is *allowed*, it just reports what the user did. The host
 * re-checks ACTIVE state before injecting anything (§2.4).
 *
 * §1.4 — mouse coordinates go out as normalized 0–1 floats, not pixels. The
 * host multiplies by its own screen size, so a 1440p browser window driving a
 * 1080p desktop needs no scaling math and no DPI correction on either side.
 *
 * The one piece of real geometry here is letterboxing: the <video> is drawn
 * with `object-fit: contain`, so the remote screen occupies a centered box
 * inside the element and the bars around it are not part of the desktop.
 * Mapping from the element rect instead of the *displayed image* rect would
 * put the host cursor a few percent off everywhere except dead centre.
 */
import * as React from "react";
import { mouseButtonName, type DuxoConnection } from "./webrtc";

/**
 * §10.3c — the host drops anything past 100 messages/s/type. Moves are the
 * only high-rate stream, so cap them well below that; 16ms ≈ 60/s still feels
 * continuous and leaves headroom for clicks and keys in the same window.
 */
const MOUSE_MOVE_INTERVAL_MS = 16;

/**
 * Keys the browser would otherwise act on itself. We swallow these so that
 * e.g. Ctrl+S saves on the *remote* machine rather than opening the viewer's
 * own save dialog. Deliberately NOT swallowed: F5/F11/F12, Ctrl+W, Ctrl+T,
 * Escape — the user must always be able to leave, reload, or bail out of
 * fullscreen locally, and browsers block most of those anyway.
 */
const LOCAL_ESCAPE_HATCH_KEYS = new Set([
  "F5",
  "F11",
  "F12",
  "Escape",
]);

export interface RemoteInputOptions {
  /** The <video> showing the remote screen. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** The connection to send on; null while connecting. */
  connRef: React.RefObject<DuxoConnection | null>;
  /**
   * Gate. False for view-only sessions (§0.2 Linux Wayland) and any phase
   * other than ACTIVE — no listener is attached at all when false, so there
   * is no path from a keystroke to the wire.
   */
  enabled: boolean;
}

export interface RemoteInputState {
  /** True while the remote surface has keyboard focus. */
  hasFocus: boolean;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The displayed-image rect of an `object-fit: contain` video, in client
 * coordinates. Falls back to the element rect before metadata loads, when
 * videoWidth/videoHeight are still 0.
 *
 * Exported for testing: this is the one piece of real geometry in the input
 * path, and getting it wrong offsets every click by a few percent — a bug that
 * looks like "the remote cursor is slightly drunk" rather than an error.
 */
export function displayedVideoRect(
  rect: Box,
  videoWidth: number,
  videoHeight: number,
): Box {
  if (!videoWidth || !videoHeight || !rect.width || !rect.height) {
    return rect;
  }
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  return {
    left: rect.left + (rect.width - width) / 2,
    top: rect.top + (rect.height - height) / 2,
    width,
    height,
  };
}

/**
 * Client coordinates → normalized 0-1 desktop coordinates, or null when the
 * point falls on a letterbox bar rather than on the remote screen.
 */
export function normalizePointer(
  rect: Box,
  videoWidth: number,
  videoHeight: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } | null {
  const box = displayedVideoRect(rect, videoWidth, videoHeight);
  if (!box.width || !box.height) return null;
  const x = (clientX - box.left) / box.width;
  const y = (clientY - box.top) / box.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

export function useRemoteInput({
  videoRef,
  connRef,
  enabled,
}: RemoteInputOptions): RemoteInputState {
  const [hasFocus, setHasFocus] = React.useState(false);
  const lastMoveSentAt = React.useRef(0);
  const pressedKeys = React.useRef(new Set<string>());

  React.useEffect(() => {
    const video = videoRef.current;
    if (!enabled || !video) return;

    // Point the browser's own cursor at the remote one rather than an I-beam,
    // and make the surface focusable so it can receive key events at all.
    video.style.cursor = "crosshair";

    /** Normalized 0–1 position, or null if the pointer is on a letterbox bar. */
    function normalize(e: PointerEvent | WheelEvent): { x: number; y: number } | null {
      const v = videoRef.current;
      if (!v) return null;
      return normalizePointer(
        v.getBoundingClientRect(),
        v.videoWidth,
        v.videoHeight,
        e.clientX,
        e.clientY,
      );
    }

    function onPointerMove(e: PointerEvent) {
      const now = performance.now();
      if (now - lastMoveSentAt.current < MOUSE_MOVE_INTERVAL_MS) return;
      const p = normalize(e);
      if (!p) return;
      lastMoveSentAt.current = now;
      connRef.current?.sendMouseMove(p.x, p.y);
    }

    function onPointerDown(e: PointerEvent) {
      const p = normalize(e);
      if (!p) return;
      e.preventDefault();
      videoRef.current?.focus();
      // Send the position first: a click at the wrong place is worse than a
      // late one, and the host has no other way to know where the press landed
      // if the last throttled move was up to 16ms stale.
      connRef.current?.sendMouseMove(p.x, p.y);
      connRef.current?.sendMouseClick(mouseButtonName(e.button), "down");
    }

    function onPointerUp(e: PointerEvent) {
      // No normalize() gate here — a button pressed inside the image must be
      // released on the host even if the pointer drifted onto a bar first,
      // otherwise the remote desktop is left with a stuck button.
      e.preventDefault();
      connRef.current?.sendMouseClick(mouseButtonName(e.button), "up");
    }

    function onContextMenu(e: Event) {
      // Right-click belongs to the remote desktop, not to the browser.
      e.preventDefault();
    }

    function onWheel(e: WheelEvent) {
      const p = normalize(e);
      if (!p) return;
      e.preventDefault();
      connRef.current?.sendMouseScroll(e.deltaX, e.deltaY);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (LOCAL_ESCAPE_HATCH_KEYS.has(e.key) || LOCAL_ESCAPE_HATCH_KEYS.has(e.code)) {
        return;
      }
      e.preventDefault();
      // Browsers auto-repeat held keys; the host does its own repeat once it
      // sees a down without an up, so forwarding repeats would double it.
      if (e.repeat) return;
      pressedKeys.current.add(e.code);
      connRef.current?.sendKeyEvent(e.code, "down");
    }

    function onKeyUp(e: KeyboardEvent) {
      if (LOCAL_ESCAPE_HATCH_KEYS.has(e.key) || LOCAL_ESCAPE_HATCH_KEYS.has(e.code)) {
        return;
      }
      e.preventDefault();
      pressedKeys.current.delete(e.code);
      connRef.current?.sendKeyEvent(e.code, "up");
    }

    function releaseEverything() {
      // Alt-tabbing away mid-chord would otherwise leave Alt or Ctrl latched
      // down on the host with no event coming to release it.
      for (const code of pressedKeys.current) {
        connRef.current?.sendKeyEvent(code, "up");
      }
      pressedKeys.current.clear();
    }

    function onFocus() {
      setHasFocus(true);
    }
    function onBlur() {
      setHasFocus(false);
      releaseEverything();
    }
    function onVisibilityChange() {
      if (document.hidden) releaseEverything();
    }

    video.addEventListener("pointermove", onPointerMove);
    video.addEventListener("pointerdown", onPointerDown);
    video.addEventListener("contextmenu", onContextMenu);
    video.addEventListener("wheel", onWheel, { passive: false });
    video.addEventListener("keydown", onKeyDown);
    video.addEventListener("keyup", onKeyUp);
    video.addEventListener("focus", onFocus);
    video.addEventListener("blur", onBlur);
    // Release on the window so a pointerup outside the element still counts.
    window.addEventListener("pointerup", onPointerUp);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      releaseEverything();
      video.style.cursor = "";
      video.removeEventListener("pointermove", onPointerMove);
      video.removeEventListener("pointerdown", onPointerDown);
      video.removeEventListener("contextmenu", onContextMenu);
      video.removeEventListener("wheel", onWheel);
      video.removeEventListener("keydown", onKeyDown);
      video.removeEventListener("keyup", onKeyUp);
      video.removeEventListener("focus", onFocus);
      video.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      setHasFocus(false);
    };
  }, [enabled, videoRef, connRef]);

  return { hasFocus };
}
