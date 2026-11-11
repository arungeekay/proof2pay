import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // POD and photo uploads go through server actions (default limit 1 MB).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};

export default nextConfig;
