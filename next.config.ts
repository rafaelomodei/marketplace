import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep verification builds isolated from the systemd service's .next directory.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  serverExternalPackages: ["better-sqlite3", "sharp"],
  devIndicators: false,
};

export default nextConfig;
