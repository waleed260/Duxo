import { describe, expect, it } from "vitest";
import { displayedVideoRect, normalizePointer } from "@/lib/remote-input";
import { mouseButtonName } from "@/lib/webrtc";

/**
 * §1.4 — the wire carries normalized 0–1 coordinates, so every one of these
 * assertions is about whether a click lands where the user aimed on the remote
 * desktop. An error here is invisible in any type check and shows up only as a
 * cursor that is subtly in the wrong place.
 */
describe("displayedVideoRect", () => {
  const element = { left: 0, top: 0, width: 1600, height: 900 };

  it("fills the element when aspect ratios match", () => {
    expect(displayedVideoRect(element, 1920, 1080)).toEqual(element);
  });

  it("letterboxes a 4:3 desktop inside a 16:9 element", () => {
    // 1024x768 into 1600x900: height binds, so the image is 1200x900 with
    // 200px pillarbox bars either side.
    const box = displayedVideoRect(element, 1024, 768);
    expect(box.width).toBeCloseTo(1200);
    expect(box.height).toBeCloseTo(900);
    expect(box.left).toBeCloseTo(200);
    expect(box.top).toBeCloseTo(0);
  });

  it("letterboxes an ultrawide desktop inside a 16:9 element", () => {
    // 2560x1080 into 1600x900: width binds, giving 1600x675 and 112.5px bars
    // above and below.
    const box = displayedVideoRect(element, 2560, 1080);
    expect(box.width).toBeCloseTo(1600);
    expect(box.height).toBeCloseTo(675);
    expect(box.top).toBeCloseTo(112.5);
  });

  it("falls back to the element rect before video metadata loads", () => {
    // videoWidth/videoHeight are 0 until loadedmetadata fires.
    expect(displayedVideoRect(element, 0, 0)).toEqual(element);
  });

  it("accounts for the element's own page offset", () => {
    const offset = { left: 40, top: 60, width: 1600, height: 900 };
    const box = displayedVideoRect(offset, 1024, 768);
    expect(box.left).toBeCloseTo(240);
    expect(box.top).toBeCloseTo(60);
  });
});

describe("normalizePointer", () => {
  const element = { left: 0, top: 0, width: 1600, height: 900 };

  it("maps the centre to (0.5, 0.5)", () => {
    expect(normalizePointer(element, 1920, 1080, 800, 450)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("maps the corners to the unit square", () => {
    expect(normalizePointer(element, 1920, 1080, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(normalizePointer(element, 1920, 1080, 1600, 900)).toEqual({
      x: 1,
      y: 1,
    });
  });

  it("corrects for pillarbox bars rather than mapping the element", () => {
    // With a 4:3 desktop the image starts at x=200. Mapping from the element
    // would report 0.125 here; the true left edge of the desktop is 0.
    expect(normalizePointer(element, 1024, 768, 200, 0)).toEqual({ x: 0, y: 0 });
    // And the middle of the image is not the middle of the element's width
    // measured naively — but it is still 0.5 of the desktop.
    const mid = normalizePointer(element, 1024, 768, 800, 450);
    expect(mid?.x).toBeCloseTo(0.5);
    expect(mid?.y).toBeCloseTo(0.5);
  });

  it("returns null on a letterbox bar", () => {
    // x=100 is inside the element but on the left pillarbox bar, which is not
    // part of the remote desktop — clicking there must send nothing.
    expect(normalizePointer(element, 1024, 768, 100, 450)).toBeNull();
    expect(normalizePointer(element, 2560, 1080, 800, 50)).toBeNull();
  });

  it("returns null outside the element entirely", () => {
    expect(normalizePointer(element, 1920, 1080, -10, 450)).toBeNull();
    expect(normalizePointer(element, 1920, 1080, 800, 1200)).toBeNull();
  });

  it("returns null for a zero-sized element", () => {
    expect(
      normalizePointer({ left: 0, top: 0, width: 0, height: 0 }, 1920, 1080, 0, 0),
    ).toBeNull();
  });
});

describe("mouseButtonName", () => {
  it("maps DOM button numbers to the §1.4 wire names", () => {
    // DOM order is left=0, middle=1, right=2 — not left/right/middle, which is
    // the ordering the names suggest and the easy place to get this backwards.
    expect(mouseButtonName(0)).toBe("left");
    expect(mouseButtonName(1)).toBe("middle");
    expect(mouseButtonName(2)).toBe("right");
  });

  it("treats unknown buttons as left rather than dropping them", () => {
    expect(mouseButtonName(4)).toBe("left");
  });
});
