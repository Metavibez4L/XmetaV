import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  serverExternalPackages: ["pg"],
  experimental: {
    optimizePackageImports: ["lucide-react", "@supabase/supabase-js", "viem"],
  },
};

export default nextConfig;
