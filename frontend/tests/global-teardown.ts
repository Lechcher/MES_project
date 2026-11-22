/**
 * Global test teardown for Playwright e2e tests.
 *
 * Stops the mail sink the auth flows delivered through. Individual test
 * fixtures remain responsible for cleaning up test data they create.
 */

import { stopMailSink } from "./fixtures/mail-sink";

export default async function globalTeardown() {
  await stopMailSink();
}