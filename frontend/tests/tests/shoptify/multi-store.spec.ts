/**
 * Shopify commerce e2e smoke.
 *
 * Walks the app's entry (stores overview), the cross-store order board, and
 * the bulk-fulfillment form as a role with commerce access. Seeded data has
 * no connected stores, so the smoke verifies the shell, the empty states,
 * and the role gating rather than store rows.
 *
 * Sign-in goes through the shared `LoginPage` (label-based, repaired with
 * the e2e harness); each test authenticates its own viewer, matching the
 * one-viewer-per-test convention of the platform's other specs.
 */

import { expect, test } from "../../fixtures";
import { ShoptifyPage } from "../../pages/shoptify/shoptify";

const TECH_LEAD = {
  email: "tech.lead@mes.local",
  password: "MES-dev-seed-2026!",
};

const EMPLOYEE = {
  email: "employee@mes.local",
  password: "MES-dev-seed-2026!",
};

test.describe("shoptify app", () => {
  test("the launcher entry opens the stores overview for commerce roles", async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.login(TECH_LEAD.email, TECH_LEAD.password);

    const shoptify = new ShoptifyPage(page);
    await shoptify.gotoStores();

    await expect(
      page.getByRole("heading", { level: 1, name: /shopify stores/i }),
    ).toBeVisible();
    await expect(shoptify.connectHeading).toBeVisible();
  });

  test("the order board renders with its filters and bulk-fulfillment form", async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.login(TECH_LEAD.email, TECH_LEAD.password);

    const shoptify = new ShoptifyPage(page);
    await shoptify.gotoOrders();

    await expect(
      page.getByRole("heading", { level: 1, name: /orders/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/tracking company/i)).toBeVisible();
    await expect(page.getByLabel(/tracking number/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /fulfill 0 selected/i }),
    ).toBeVisible();
  });

  test("every commerce section renders its own screen", async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.login(TECH_LEAD.email, TECH_LEAD.password);

    const shoptify = new ShoptifyPage(page);
    for (const [navigate, heading] of [
      [() => shoptify.gotoC(), /catalog/i],
      [() => shoptify.gotoCustomers(), /customers/i],
      [() => shoptify.gotoFinance(), /finance/i],
      [() => shoptify.gotoAutomation(), /automation/i],
    ] as const) {
      await navigate();
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
    }
  });

  test("a role without commerce access sees no shoptify entry", async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.login(EMPLOYEE.email, EMPLOYEE.password);

    // The launcher and top navigation carry no shoptify entry.
    await expect(
      page.getByRole("link", { name: /shopify/i }).first(),
    ).toBeHidden();

    // The direct route serves the no-access gate, not the commerce shell.
    const shoptify = new ShoptifyPage(page);
    await shoptify.gotoStores();
    await expect(
      page.getByRole("heading", { level: 1, name: /shopify stores/i }),
    ).toBeVisible();
    await expect(page.getByText(/no shopify access/i)).toBeVisible();
    await expect(shoptify.connectHeading).toBeHidden();
  });
});
