/**
 * Audit log tests.
 *
 * Covers audit log viewing, filtering, and export.
 */

import { test } from "../../fixtures";
import { AuditLogPage } from "../../pages/audit-log/audit-log";

test("view audit logs and export", async ({ page, loginPage }) => {
  await loginPage.login("demo@mes.local", "demo-password");

  const auditPage = new AuditLogPage(page);
  await auditPage.goto();
  await auditPage.refresh();
  await auditPage.exportLogs();
});
