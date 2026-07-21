/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
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
