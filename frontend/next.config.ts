import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
    // Every screen is gated on a client-held viewer session and renders on the
    // client, so no route produces a prerenderable/instant static shell. Validate
    // only segments that opt in explicitly, keeping the dev log free of
    // instant-navigation insights for this client-only prototype.
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
