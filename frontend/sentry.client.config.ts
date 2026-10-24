/**
 * Sentry client-side SDK configuration for the Next.js frontend.
 *
 * Initializes Sentry in the browser with environment-specific DSN,
 * traces sampling, and sensitive data filtering via `beforeSend`.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const SENTRY_ENVIRONMENT =
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development";

const isProduction = process.env.NODE_ENV === "production";

export default Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: isProduction ? 0.01 : 1.0,
  replaysSessionSampleRate: isProduction ? 0.01 : 0,
  replaysOnErrorSampleRate: isProduction ? 1.0 : 0,

  // Filter sensitive data before sending to Sentry
  beforeSend(event) {
    // Scrub Authorization headers from request data
    if (event.request?.headers) {
      const headers = event.request.headers as Record<string, string>;
      if (headers.authorization) {
        headers.authorization = "[Filtered]";
      }
      if (headers.cookie) {
        headers.cookie = "[Filtered]";
      }
    }

    // Scrub sensitive values from extra/contexts
    const sensitiveKeys = ["password", "token", "secret", "key", "credential"];
    const scrub = (obj: unknown): unknown => {
      if (Array.isArray(obj)) return obj.map(scrub);
      if (obj && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
          const isSensitive = sensitiveKeys.some((k) =>
            key.toLowerCase().includes(k),
          );
          result[key] = isSensitive ? "[Filtered]" : scrub(value);
        }
        return result;
      }
      return obj;
    };

    if (event.extra) {
      event.extra = scrub(event.extra) as Record<string, unknown>;
    }

    return event;
  },

  // Don't send events in development without a DSN
  enabled: !!SENTRY_DSN,
});
