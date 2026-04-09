import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Keep Turbopack scoped to this project so local builds don't try to infer
    // the parent workspace from unrelated lockfiles in ClaudeCode.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
