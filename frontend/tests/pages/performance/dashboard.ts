/**
 * Performance dashboard page object.
 *
 * Interacts with the performance page at `/performance`. Drives the two tabs,
 * the audit scope and time frame selectors, the multi-select period and role
 * pickers, the personal score-by-month chart, and the detail table.
 */

import type { Locator, Page } from "@playwright/test";
import { BasePage } from "../base";

/** The audit row grain the combined table and chart describe. */
export type AuditScope = "company" | "department" | "employees-in-department";

/** The audit time frame selector's options, in the order they are offered. */
export const AUDIT_TIME_FRAMES = ["month", "quarter", "year"] as const;

export type AuditTimeFrame = (typeof AUDIT_TIME_FRAMES)[number];

/** One GraphQL operation the page sent, with the variables it carried. */
export interface GraphQLCall {
  /** The operation's name, e.g. `PersonalKpiDashboard`. */
  operation: string;
  /** The operation's variables. */
  variables: Record<string, unknown>;
}

/** The body the app's GraphQL proxy receives. */
interface GraphQLRequestBody {
  query?: string;
  variables?: Record<string, unknown>;
}

/** One month a Performance read asked for. */
export interface RequestedMonth {
  periodYear: number;
  periodMonth: number;
}

/** A month's identity, so two month lists can be compared. */
export function monthKey(month: RequestedMonth): string {
  return `${month.periodYear}-${month.periodMonth}`;
}

/**
 * The months a recorded call asked for.
 *
 * The audit reads name their months in `filter.months` and the personal reads
 * in `input.months`; both describe the same period, so one helper reads either.
 */
export function monthsOf(call: GraphQLCall): RequestedMonth[] {
  const filter = call.variables.filter as
    | { months?: RequestedMonth[] }
    | undefined;
  const input = call.variables.input as
    | { months?: RequestedMonth[] }
    | undefined;
  return filter?.months ?? input?.months ?? [];
}

/** The recorded calls to one operation. */
export function callsTo(
  calls: GraphQLCall[],
  operation: string,
): GraphQLCall[] {
  return calls.filter((call) => call.operation === operation);
}

export class PerformanceDashboardPage extends BasePage {
  readonly dashboardLink = this.page.getByRole("link", { name: /dashboard/i });

  /** The score card's mono figure, the personal dashboard's anchor. */
  readonly scoreCard = this.page.getByText(/KPI score and audit/i).first();

  /** The tab triggers, by their localized labels. */
  readonly personalTab = this.page.getByRole("tab", {
    name: /personal kpi dashboard/i,
  });
  readonly auditTab = this.page.getByRole("tab", {
    name: /audit chart and table/i,
  });

  /** The audit selectors. */
  readonly scopeSelect = this.page.getByLabel(/ranking scope/i);
  readonly timeFrameSelect = this.page.getByLabel(/time frame/i);
  /** The department selector, present only in the per-department scope. */
  readonly departmentSelect = this.page.getByLabel(/department/i);

  /**
   * The multi-select period picker, in the page header.
   *
   * The header owns the selection so the audit surface, the personal
   * dashboard, and the artifacts they produce can never describe two different
   * periods.
   */
  readonly periodPicker = this.page.getByLabel(/periods/i);
  readonly periodInput = this.page.locator("#performance-periods");
  /** The chips naming the periods the selection covers. */
  readonly periodChips = this.page.locator(
    '[data-slot="combobox-chips"]:has(#performance-periods) [data-slot="combobox-chip"]',
  );

  /**
   * The multi-select role filter, offered only where the authorized rows
   * expose more than one role.
   */
  readonly rolePicker = this.page.getByLabel(/^role$/i);
  readonly roleInput = this.page.locator("#audit-roles");
  /** The chips naming the selected roles. */
  readonly roleChips = this.page.locator(
    '[data-slot="combobox-chips"]:has(#audit-roles) [data-slot="combobox-chip"]',
  );

  /** The audit surface's ranking chart. */
  readonly rankingChart = this.page
    .locator("section")
    .filter({
      has: this.page.getByRole("heading", {
        name: /performance score ranking/i,
      }),
    })
    .locator("canvas");

  /** The detail table. */
  readonly detailTable = this.page.getByRole("table").last();

  /** The personal dashboard's score-by-month chart. */
  readonly trendChart = this.page
    .locator("section")
    .filter({
      has: this.page.getByRole("heading", { name: /kpi score by month/i }),
    })
    .locator("canvas");

  /** The Role column header of the employee detail table. */
  readonly roleColumnHeader = this.page.getByRole("columnheader", {
    name: /^role$/i,
  });

  async goto() {
    // `LoginPage.login` returns before the client-side redirect settles, so the
    // session cookie may not have landed when we navigate. Wait for the sign-in
    // page to be left before entering the app.
    await this.page
      .waitForURL((url) => !url.pathname.startsWith("/signin"), {
        timeout: 20_000,
      })
      .catch(() => undefined);
    await this.gotoAndWait("/performance");
    // A guard bounce back to /signin means the session still had not landed.
    if (this.page.url().includes("/signin")) {
      await this.gotoAndWait("/performance");
    }
    await this.waitForNetworkIdle();
  }

  /** Open the Personal KPI Dashboard tab. */
  async openPersonal() {
    await this.personalTab.click();
    await this.waitForNetworkIdle();
  }

  /** Open the Audit chart and table tab. */
  async openAudit() {
    await this.auditTab.click();
    await this.waitForNetworkIdle();
  }

  /** Pick a ranking scope on the audit tab. */
  async selectScope(scope: AuditScope) {
    await this.scopeSelect.click();
    const name =
      scope === "company"
        ? /company-wide/i
        : scope === "department"
          ? /department-wide/i
          : /employees in department/i;
    await this.page.getByRole("option", { name }).click();
    await this.waitForNetworkIdle();
  }

  /**
   * Pick a department on the per-department scope's selector.
   *
   * The selector is only enabled where the role may choose, so a role whose
   * data scope fixes the department cannot be driven through this method.
   */
  async selectDepartment(name: string | RegExp) {
    await this.departmentSelect.click();
    // `exact` matters: the seeded department names include one that starts
    // with another's name, so a substring match resolves to two options.
    await this.page
      .getByRole("option", { name, exact: typeof name === "string" })
      .click();
    await this.waitForNetworkIdle();
  }

  /** Whether the department selector is present and interactable. */
  async departmentSelectorDisabled() {
    return this.departmentSelect.isDisabled();
  }

  /** Pick a time frame on the audit tab. */
  async selectTimeFrame(frame: AuditTimeFrame) {
    await this.timeFrameSelect.click();
    await this.page
      .getByRole("option", {
        name: new RegExp(frame, "i"),
      })
      .click();
    await this.waitForNetworkIdle();
  }

  /** The options of whichever combobox popup is open. */
  private get openOptions(): Locator {
    return this.page
      .locator('[data-slot="combobox-content"]')
      .last()
      .getByRole("option");
  }

  /** The labels of the periods the selection covers, as the chips show them. */
  async selectedPeriodLabels(): Promise<string[]> {
    const labels = await this.periodChips.allTextContents();
    return labels.map((label) => label.trim()).filter(Boolean);
  }

  /**
   * Add `count` periods to the selection and return every selected period's
   * label, as the chips show them.
   *
   * The labels come from the open popup rather than a hard-coded month, so
   * the selection follows the current date instead of going stale. The picker
   * is a multi-select: the popup stays open between clicks and each click
   * toggles one period.
   */
  async addPeriods(count: number): Promise<string[]> {
    await this.page.keyboard.press("Escape");
    await this.periodInput.click();
    const options = this.openOptions;
    const total = await options.count();
    let added = 0;
    for (let index = 0; index < total && added < count; index += 1) {
      const option = options.nth(index);
      // The frame's current period starts selected, so clicking it would
      // deselect it rather than widen the selection.
      if ((await option.getAttribute("aria-selected")) === "true") continue;
      await option.click();
      added += 1;
    }
    await this.page.keyboard.press("Escape");
    await this.waitForNetworkIdle();
    return this.selectedPeriodLabels();
  }

  /** The roles the filter offers, in the order it offers them. */
  async readRoleOptions(): Promise<string[]> {
    await this.page.keyboard.press("Escape");
    await this.roleInput.click();
    const labels = await this.openOptions.allTextContents();
    await this.page.keyboard.press("Escape");
    return labels.map((label) => label.trim());
  }

  /**
   * Select several roles by their visible names.
   *
   * The picker is a multi-select too, so each click toggles one role and the
   * popup stays open until it is dismissed.
   */
  async selectRoles(names: string[]) {
    await this.page.keyboard.press("Escape");
    await this.roleInput.click();
    const popup = this.page.locator('[data-slot="combobox-content"]').last();
    for (const name of names) {
      await popup.getByRole("option", { name, exact: true }).click();
    }
    await this.page.keyboard.press("Escape");
    await this.waitForNetworkIdle();
  }

  /** The detail table's data rows, excluding its header. */
  detailRows() {
    return this.detailTable.locator("tbody tr");
  }

  /**
   * The Role column's cells.
   *
   * The Role column is the third of the employee detail table — No., Employee
   * Name, Role — so the department grain, which has no role column, is not
   * addressed by this locator.
   */
  roleCells() {
    return this.detailTable.locator("tbody tr td:nth-child(3)");
  }

  /** Read the canvas the renderer drew into, as a data URL of its pixels. */
  async chartPixels(locator = this.rankingChart) {
    return locator.evaluate((node) =>
      (node as HTMLCanvasElement).toDataURL("image/png"),
    );
  }

  /**
   * Start recording the GraphQL calls the page makes.
   *
   * The browser talks to the app's own same-origin proxy at
   * `/api/mes/graphql`, so the variables that reach the API are visible in
   * the request the page sends. That is how a test can assert what a
   * selection asked for without depending on what the database happens to
   * hold.
   */
  recordGraphQL(): GraphQLCall[] {
    const calls: GraphQLCall[] = [];
    this.page.on("request", (request) => {
      if (request.method() !== "POST") return;
      if (!request.url().includes("/api/mes/graphql")) return;
      let body: GraphQLRequestBody | null = null;
      try {
        body = request.postDataJSON() as GraphQLRequestBody;
      } catch {
        return;
      }
      const operation = /\b(?:query|mutation)\s+([A-Za-z0-9_]+)/.exec(
        body?.query ?? "",
      )?.[1];
      if (!operation) return;
      calls.push({ operation, variables: body?.variables ?? {} });
    });
    return calls;
  }
}

/** Reach the page from any test, given the fixtures' `page`. */
export function performancePage(page: Page) {
  return new PerformanceDashboardPage(page);
}
