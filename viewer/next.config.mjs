/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // §0.3 — Vercel deploys the viewer folder. Default Next settings are fine.
  experimental: {
    // Improve dev performance for the data-channel code paths.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
