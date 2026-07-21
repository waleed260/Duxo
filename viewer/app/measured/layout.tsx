import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Measured",
  description: "Measured — health/wellness wearable",
}

export default function MeasuredLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="font-sans">{children}</div>
}
