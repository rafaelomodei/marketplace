import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // openscad-wasm embeds an 11 MB wasm: load it from node_modules on the server instead of bundling it.
  serverExternalPackages: ["better-sqlite3", "sharp", "openscad-wasm-prebuilt"],
  devIndicators: false,
  webpack(config) {
    // Lab models (.scad) are imported as plain text.
    config.module.rules.push({ test: /\.scad$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
