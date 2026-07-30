/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export disabled — API routes require a server runtime.
  // output: "export",
  basePath: "/Duxo",
  assetPrefix: "/Duxo/",
  images: {
    unoptimized: true,
  },
  trailingSlash: true,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
