/**
 * Self-service account credentials through the UI.
 *
 * A freshly created user changes their own password and email from the
 * Settings Account tab: the password change keeps them signed in, the email
 * change mails a verification link that the mail sink captures, and opening
 * that link applies the change — the same path a recipient takes.
 */

import { expect, test } from "../../fixtures";
import { latestConfirmEmailLink } from "../../fixtures/mail-sink";

const START_PASSWORD = "e2e-start-password";
const NEW_PASSWORD = "e2e-new-password";

/** A unique address per run, so repeat runs never collide. */
function uniqueEmail(tag: string): string {
  return `e2e-account-${tag}-${Date.now()}@test.local`;
}

/** Create an account through the API with the saved admin session. */
async function createAccount(
  request: import("@playwright/test").APIRequestContext,
  email: string,
): Promise<void> {
  const response = await request.post("/api/mes/graphql", {
    headers: { "Content-Type": "application/json" },
    data: JSON.stringify({
      query: /* GraphQL */ `
        mutation CreateAccount($input: CreateUserInput!) {
          createUser(input: $input) {
            id
            userCode
            email
          }
        }
      `,
      variables: {
        input: {
          userCode: `E2E-${Date.now()}`,
          fullName: "E2E Account",
          email,
          password: START_PASSWORD,
          roleCodes: ["EMPLOYEE"],
        },
      },
    }),
  });
  const body = (await response.json()) as {
    data?: { createUser: unknown } | null;
    errors?: { message: string }[];
  };
  if (!body.data?.createUser) {
    throw new Error(`createUser failed: ${JSON.stringify(body.errors)}`);
  }
}

/**
 * Sign in on a fresh context, so each flow starts from no session.
 *
 * `browser.newContext()` inherits the configuration's storage state (the
 * saved admin session), so cookies are cleared before the sign-in page
 * opens — otherwise every "fresh" context would already be signed in.
 */
async function signIn(
  browser: import("@playwright/test").Browser,
  email: string,
  password: string,
): Promise<import("@playwright/test").Page> {
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Wait for the session to settle: navigating away before the sign-in
  // request completes aborts it and leaves the visitor unsigned-in.
  await page.waitForURL((url) => !url.pathname.startsWith("/signin"), {
    timeout: 30_000,
  });
  return page;
}

/** Attempt a sign-in that is expected to fail, and stay on the sign-in page. */
async function attemptSignIn(
  browser: import("@playwright/test").Browser,
  email: string,
  password: string,
): Promise<import("@playwright/test").Page> {
  const context = await browser.newContext();
  await context.clearCookies();
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByLabel("email").fill(email);
  await page.getByLabel("password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 30_000 });
  return page;
}

/** Sign in and open the Settings Account tab. */
async function openAccountTab(
  browser: import("@playwright/test").Browser,
  email: string,
  password: string,
): Promise<import("@playwright/test").Page> {
  const page = await signIn(browser, email, password);
  await page.goto("/settings");
  await expect(page.getByRole("tab", { name: "Account" })).toBeVisible();
  return page;
}

test("changes the password from the Account tab", async ({
  browser,
  request,
}) => {
  const email = uniqueEmail("password");
  await createAccount(request, email);

  const page = await openAccountTab(browser, email, START_PASSWORD);
  await page.getByLabel("Current password").fill(START_PASSWORD);
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Change password" }).click();

  await expect(page.getByText("Your password has been changed.")).toBeVisible();

  // The new password signs in…
  const fresh = await signIn(browser, email, NEW_PASSWORD);
  await expect(fresh).not.toHaveURL(/\/signin/);
  // …and the old one no longer does.
  const rejected = await attemptSignIn(browser, email, START_PASSWORD);
  await expect(rejected).toHaveURL(/\/signin/);
});

test("starts an email change and the confirmation link applies it", async ({
  browser,
  request,
}) => {
  const email = uniqueEmail("email");
  const newEmail = uniqueEmail("email-new");
  await createAccount(request, email);

  const page = await openAccountTab(browser, email, START_PASSWORD);
  await page.getByLabel("Your password").fill(START_PASSWORD);
  await page.getByLabel("New email address").fill(newEmail);
  await page.getByRole("button", { name: "Start email change" }).click();

  await expect(
    page.getByText(`A verification link was sent to ${newEmail}.`),
  ).toBeVisible();

  // The link went to the new address; the sink holds it.
  const link = latestConfirmEmailLink();
  expect(link).toContain("/confirm-email?token=");
  if (!link) throw new Error("no confirmation link in the mail sink");

  // Opening it needs no session: a fresh context stands in for the mailbox.
  const confirmContext = await browser.newContext();
  await confirmContext.clearCookies();
  const confirmPage = await confirmContext.newPage();
  await confirmPage.goto(link);
  await confirmPage
    .getByRole("button", { name: "Confirm email change" })
    .click();
  await expect(
    confirmPage.getByText("Your email address has been changed."),
  ).toBeVisible();

  // The new address is the one that signs in now.
  const signedIn = await signIn(browser, newEmail, START_PASSWORD);
  await expect(signedIn).not.toHaveURL(/\/signin/);
});

test("an unusable confirmation link is reported as such", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/confirm-email?token=not-a-real-token");
  await page.getByRole("button", { name: "Confirm email change" }).click();
  await expect(
    page.getByText("This confirmation link is invalid or has expired."),
  ).toBeVisible();
});
