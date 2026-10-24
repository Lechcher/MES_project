/**
 * Sentry edge runtime SDK configuration for the Next.js frontend.
 *
 * Initializes Sentry for Edge middleware with environment-specific DSN
 * and sensitive data filtering via `beforeSend`.
 */

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "development";

const isProduction = process.env.NODE_ENV === "production";

export default Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,
  tracesSampleRate: isProduction ? 0.01 : 1.0,

  // Filter sensitive data before sending to Sentry
  beforeSend(event) {
    if (event.request?.headers) {
      const headers = event.request.headers as Record<string, string>;
      if (headers.authorization) {
        headers.authorization = "[Filtered]";
      }
      if (headers.cookie) {
        headers.cookie = "[Filtered]";
      }
    }

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

  enabled: !!SENTRY_DSN,
});
