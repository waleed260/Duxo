/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export disabled — API routes require a server runtime.
  // output: "export",
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
