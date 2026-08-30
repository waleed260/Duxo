/**
 * §1.7 — Viewer logging is the browser console and nothing else.
 *
 * "Never ship telemetry that phones home to a server you pay for. RTDB
 * session metadata is your only analytics." The landing copy and page
 * metadata make the same promise to users ("zero telemetry"), so this must
 * stay a local-only measurement hook — no beacons, no third-party endpoint,
 * no page paths leaving the browser.
 *
 * §6.5 lists the numbers worth watching; these are read from the console
 * (or a `performance.mark` timeline) during Phase 3–4 testing.
 */
export interface WebVitalMetric {
  id: string;
  name: string;
  label: string;
  value: number;
}

export function reportWebVitals(metric: WebVitalMetric): void {
  if (typeof performance !== "undefined" && "mark" in performance) {
    // Keeps the metric on the browser's own timeline for DevTools/Lighthouse.
    performance.mark(`web-vital:${metric.name}`, {
      detail: { value: metric.value, id: metric.id },
    });
  }

  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.info(
      `[web-vital] ${metric.name} = ${Math.round(metric.value)} (${metric.label})`,
    );
  }
}
