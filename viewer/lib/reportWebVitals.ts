export function reportWebVitals(metric: {
  id: string;
  name: string;
  label: string;
  value: number;
}) {
  if (process.env.NODE_ENV === "production") {
    const body = JSON.stringify({
      event: metric.name,
      value: Math.round(metric.value),
      id: metric.id,
      page: window.location.pathname,
    });
    const url = `https://www.google-analytics.com/g/collect`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, body);
    } else {
      fetch(url, { method: "POST", body, keepalive: true });
    }
  }
}
