import { join } from "node:path";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = join(__dirname);

const allowedDevOrigins = ["mes.localhost:3000"];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  // Trace only the server files the app needs so the production image ships a
  // self-contained `.next/standalone` bundle instead of the full node_modules.
  output: "standalone",
  experimental: {
    agentFeedback: true,
    agentUpgrade: "security",
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin();

const sentryWebpackPluginOptions = {
  silent: true,
};

export default withSentryConfig(
  withNextIntl(nextConfig),
  sentryWebpackPluginOptions,
);
