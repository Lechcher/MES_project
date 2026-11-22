/**
 * Audit log tests.
 *
 * Covers audit log viewing, filtering, and export.
 */

import { expect, test } from "../../fixtures";
import { AuditLogPage } from "../../pages/audit-log/audit-log";

// The audit-log module is Super Admin / Tech Lead only.
const AUDITOR = {
  email: "super.admin@mes.local",
  password: "MES-dev-seed-2026!",
};

test("view audit logs and export", async ({ page, loginPage }) => {
  await loginPage.goto();
  await loginPage.login(AUDITOR.email, AUDITOR.password);

  const auditPage = new AuditLogPage(page);
  await auditPage.goto();
  await auditPage.refresh();
  await auditPage.exportLogs();
});

test("filtering narrows the recorded stream", async ({ page, loginPage }) => {
  await loginPage.goto();
  await loginPage.login(AUDITOR.email, AUDITOR.password);

  const auditPage = new AuditLogPage(page);
  await auditPage.goto();

  const before = await auditPage.logEntries();
  expect(before.length).toBeGreaterThan(0);

  // The action filter narrows the stream to the matching events: every row
  // left carries the action, and fewer rows remain. `system.migrate` is a
  // seeded action the operational writes never repeat.
  await page.getByLabel(/action/i).fill("system.migrate");
  await expect(auditPage.eventRows.first()).toBeVisible();
  const after = await auditPage.logEntries();
  expect(after.length).toBeGreaterThan(0);
  expect(after.length).toBeLessThan(before.length);
  for (const entry of after) {
    expect(entry).toContain("system.migrate");
  }
});
