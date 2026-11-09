import type { NextConfig } from "next";
const config: NextConfig = {
  output: process.env.FLOWMIND_STATIC_EXPORT === "true" ? "export" : undefined,
  images: { unoptimized: true },
  transpilePackages: ["@flowmind/shared"],
  trailingSlash: true,
  experimental: { cpus: 2 },
};
export default config;
