"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AuditChartAndTable } from "@/components/performance/audit-chart-and-table";
import { PersonalDashboard } from "@/components/performance/personal-dashboard";
import { useAuditPeriod } from "@/components/performance/use-audit-period";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { ExportButton } from "@/components/shared/export-action";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { effectiveDepartmentId } from "@/lib/mes/audit-department";
import type { AuditRole } from "@/lib/mes/audit-merge";
import {
  AUDIT_TIME_FRAMES,
  type AuditTimeFrame,
  defaultPeriodKeys,
  monthsForSelection,
  periodOptions,
} from "@/lib/mes/audit-period";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { type AuditScopeCode, auditScopeFor } from "@/lib/mes/queries/access";
import { DEPARTMENTS_QUERY } from "@/lib/mes/queries/common";
import {
  EXPORT_AUDIT_WORKBOOK_MUTATION,
  PRINT_KPI_REPORT_MUTATION,
} from "@/lib/mes/queries/performance";
import type { DepartmentRef, RoleCode } from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useRoleCode, useViewer } from "@/lib/mes/session";

/** The audit message key that names each time frame. */
const TIME_FRAME_LABEL_KEYS = {
  month: "frameMonth",
  quarter: "frameQuarter",
  year: "frameYear",
} as const satisfies Record<AuditTimeFrame, string>;

/** The audit message key that names each ranking scope. */
const SCOPE_LABEL_KEYS = {
  company: "scopeCompany",
  department: "scopeDepartment",
  "employees-in-department": "scopeEmployeesInDepartment",
} as const satisfies Record<AuditScopeCode, string>;

/** One period the picker offers, with its localized label. */
interface PeriodOption {
  key: string;
  label: string;
}

/** One selection the whole screen derives from. */
interface PerformanceSelection {
  tab: string;
  auditScope: AuditScopeCode;
  timeFrame: AuditTimeFrame;
  /** The selected periods of the current frame. */
  periodKeys: string[];
  /** The selected role codes; an empty selection keeps every row. */
  roleCodes: string[];
  /** The department the per-department employee grain narrows to. */
  selectedDepartmentId: string | null;
}

/**
 * Performance & Audit: the Personal KPI Dashboard for every role, the audit
 * chart and table for every role with the API's data scope applied, and the
 * print/export entry points.
 *
 * The period selection, the audit scope, the department, and the role filter
 * are selected here rather than inside a tab, so the ranking chart, the detail
 * table, the personal dashboard, and the artifacts the screen produces can
 * never describe two different periods.
 */
export function PerformanceView() {
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const fmt = useMesFormat();
  const t = useTranslations("performance.view");
  const tAudit = useTranslations("performance.audit");
  const labels = useDomainLabels();

  const periodAnchor = useComboboxAnchor();
  const roleAnchor = useComboboxAnchor();

  const [selection, setSelection] = useState<PerformanceSelection>({
    tab: "personal",
    auditScope: "company",
    timeFrame: "month",
    periodKeys: defaultPeriodKeys("month"),
    roleCodes: [],
    selectedDepartmentId: null,
  });

  // Every role reaches the audit surface; the contract decides which rows.
  const audit = auditScopeFor(role);
  // A scope with no authorized source has no selector, so fall back to the
  // first scope this role may actually read.
  const selectableScopes = audit.scopes;
  const effectiveScope: AuditScopeCode = selectableScopes.includes(
    selection.auditScope,
  )
    ? selection.auditScope
    : (selectableScopes[0] ?? "company");

  // The department list only feeds the per-department grain's selector, so it
  // is read only while that scope is active. Unconditional, because a hook may
  // not be called after an early return.
  const departmentsQuery = useApiQuery<{ departments: DepartmentRef[] }>(
    effectiveScope === "employees-in-department" ? DEPARTMENTS_QUERY : null,
    {},
    { liveArea: "users" },
  );

  const { tab, timeFrame, periodKeys, roleCodes, selectedDepartmentId } =
    selection;

  // The selection's months are what every Performance read covers.
  const months = useMemo(() => monthsForSelection(periodKeys), [periodKeys]);

  // The audit rows are read only while the audit tab is on screen, so the
  // personal tab does not pay for them.
  const auditRows = useAuditPeriod({
    months: tab === "audit" ? months : [],
    scope: effectiveScope,
    companySource: audit.companySource,
    departmentSource: audit.departmentSource,
    employeeListSource: audit.employeeListSource,
    departmentId: effectiveDepartmentId(
      selectedDepartmentId,
      viewer?.department?.id ?? null,
    ),
    viewer: viewer
      ? {
          id: viewer.id,
          fullName: viewer.fullName,
          roles: viewer.roles,
        }
      : null,
  });

  // The roles the authorized rows expose. The role filter is offered only
  // where they expose more than one.
  const availableRoles = useMemo(() => {
    const byCode = new Map<string, AuditRole>();
    for (const row of auditRows.employeeRows) {
      for (const personRole of row.roles) {
        if (!byCode.has(personRole.code)) {
          byCode.set(personRole.code, personRole);
        }
      }
    }
    return [...byCode.values()];
  }, [auditRows.employeeRows]);

  /** The selected periods' labels, in the locale's own words. */
  const periodLabel = (key: string): string => {
    if (timeFrame === "month") {
      const [year, month] = key.split("-");
      return fmt.periodMonth(Number(year), Number(month));
    }
    if (timeFrame === "quarter") {
      const [year, quarter] = key.split("-Q");
      return fmt.periodQuarter(Number(year), Number(quarter));
    }
    return fmt.periodYear(Number(key));
  };

  const periodItems: PeriodOption[] = periodOptions(timeFrame).map((key) => ({
    key,
    label: periodLabel(key),
  }));
  const selectedPeriodItems = periodItems.filter((item) =>
    periodKeys.includes(item.key),
  );
  const selectedPeriodLabel = fmt.periodSummary(
    periodKeys.map((key) => periodLabel(key)),
  );

  // A selected role the current rows do not expose keeps its chip, so the
  // reader can see why the surface is empty and remove it.
  const selectedRoleItems: AuditRole[] = roleCodes.map(
    (code) =>
      availableRoles.find((personRole) => personRole.code === code) ?? {
        code,
        name: code,
      },
  );

  if (!viewer) return null;

  const departments = departmentsQuery.data?.departments ?? [];

  // A chosen department wins; otherwise the viewer's own department, so the
  // scope opens on real rows rather than a prompt.
  const departmentId = effectiveDepartmentId(
    selectedDepartmentId,
    viewer.department?.id ?? null,
  );

  const selectionInput = {
    months: months.map((month) => ({
      periodYear: month.periodYear,
      periodMonth: month.periodMonth,
    })),
  };

  const setTimeFrame = (frame: AuditTimeFrame) =>
    setSelection((current) => ({
      ...current,
      timeFrame: frame,
      // A new frame offers a new unit, so the selection starts on the current
      // period of that unit.
      periodKeys: defaultPeriodKeys(frame),
    }));

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("performance")}
        title={t("title")}
        description={t("roleScoped", { role: role ? labels.role(role) : "—" })}
        actions={
          <>
            <div className="grid w-80 gap-1">
              <Label htmlFor="performance-periods">
                {tAudit("periodLabel")}
              </Label>
              <Combobox
                multiple
                autoHighlight
                items={periodItems}
                value={selectedPeriodItems}
                onValueChange={(next) => {
                  // A period is always selected: the API reads a month list, so
                  // an empty selection would ask for nothing.
                  if (next.length === 0) return;
                  setSelection((current) => ({
                    ...current,
                    periodKeys: next.map((item) => item.key),
                  }));
                }}
                itemToStringLabel={(item) => item.label}
                itemToStringValue={(item) => item.key}
                isItemEqualToValue={(a, b) => a.key === b.key}
              >
                <ComboboxChips ref={periodAnchor} className="w-full">
                  <ComboboxValue>
                    {(values) => (
                      <>
                        {values.map((item: PeriodOption) => (
                          <ComboboxChip key={item.key}>
                            {item.label}
                          </ComboboxChip>
                        ))}
                        <ComboboxChipsInput
                          id="performance-periods"
                          placeholder={tAudit("periodPlaceholder")}
                        />
                      </>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={periodAnchor}>
                  <ComboboxEmpty>{tAudit("periodEmpty")}</ComboboxEmpty>
                  <ComboboxList>
                    {(item: PeriodOption) => (
                      <ComboboxItem key={item.key} value={item}>
                        {item.label}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            </div>
            <ExportButton
              mutation={PRINT_KPI_REPORT_MUTATION}
              resultKey="printKpiReport"
              label={t("print")}
              variables={{ input: selectionInput }}
            />
            <ExportButton
              mutation={EXPORT_AUDIT_WORKBOOK_MUTATION}
              resultKey="exportAuditWorkbook"
              label={t("exportWorkbook")}
              variables={{ filter: selectionInput }}
            />
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSelection((current) => ({ ...current, tab: String(value) }))
        }
      >
        <TabsList variant="line">
          <TabsTrigger value="personal">{t("tabPersonal")}</TabsTrigger>
          <TabsTrigger value="audit">{t("tabAudit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <PersonalDashboard
            months={months}
            periodLabel={selectedPeriodLabel}
          />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <div className="flex flex-wrap items-end gap-4 pb-4">
            <div className="grid gap-1">
              <Label htmlFor="audit-scope">{tAudit("scopeLabel")}</Label>
              <Select
                value={effectiveScope}
                onValueChange={(value) =>
                  setSelection((current) => ({
                    ...current,
                    auditScope: String(value) as AuditScopeCode,
                  }))
                }
                disabled={selectableScopes.length < 2}
                items={Object.fromEntries(
                  selectableScopes.map((scope) => [
                    scope,
                    tAudit(SCOPE_LABEL_KEYS[scope]),
                  ]),
                )}
              >
                <SelectTrigger id="audit-scope" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {selectableScopes.map((scope) => (
                    <SelectItem key={scope} value={scope}>
                      {tAudit(SCOPE_LABEL_KEYS[scope])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1">
              <Label htmlFor="audit-time-frame">
                {tAudit("timeFrameLabel")}
              </Label>
              <Select
                value={timeFrame}
                onValueChange={(value) => setTimeFrame(value as AuditTimeFrame)}
                items={Object.fromEntries(
                  AUDIT_TIME_FRAMES.map((frame) => [
                    frame,
                    tAudit(TIME_FRAME_LABEL_KEYS[frame]),
                  ]),
                )}
              >
                <SelectTrigger id="audit-time-frame" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_TIME_FRAMES.map((frame) => (
                    <SelectItem key={frame} value={frame}>
                      {tAudit(TIME_FRAME_LABEL_KEYS[frame])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {effectiveScope === "employees-in-department" ? (
              <div className="grid gap-1">
                <Label htmlFor="audit-department">
                  {tAudit("departmentLabel")}
                </Label>
                <Select
                  value={departmentId ?? ""}
                  onValueChange={(value) =>
                    setSelection((current) => ({
                      ...current,
                      selectedDepartmentId: String(value),
                    }))
                  }
                  // The server scopes the read itself for a viewer whose data
                  // scope fixes the department, so the control stays visible
                  // but cannot change what it reports.
                  disabled={!audit.canChooseDepartment}
                  items={Object.fromEntries(
                    departments.map((department) => [
                      department.id,
                      department.name,
                    ]),
                  )}
                >
                  <SelectTrigger
                    id="audit-department"
                    className="w-56"
                    size="sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {availableRoles.length > 1 ? (
              <div className="grid w-72 gap-1">
                <Label htmlFor="audit-roles">{tAudit("roleLabel")}</Label>
                <Combobox
                  multiple
                  autoHighlight
                  items={availableRoles}
                  value={selectedRoleItems}
                  onValueChange={(next) =>
                    setSelection((current) => ({
                      ...current,
                      roleCodes: next.map((item) => item.code),
                    }))
                  }
                  itemToStringLabel={(item) => labels.role(item.code)}
                  itemToStringValue={(item) => item.code}
                  isItemEqualToValue={(a, b) => a.code === b.code}
                >
                  <ComboboxChips ref={roleAnchor} className="w-full">
                    <ComboboxValue>
                      {(values) => (
                        <>
                          {values.map((item: AuditRole) => (
                            <ComboboxChip key={item.code}>
                              {labels.role(item.code)}
                            </ComboboxChip>
                          ))}
                          <ComboboxChipsInput
                            id="audit-roles"
                            placeholder={tAudit("rolePlaceholder")}
                          />
                        </>
                      )}
                    </ComboboxValue>
                  </ComboboxChips>
                  <ComboboxContent anchor={roleAnchor}>
                    <ComboboxEmpty>{tAudit("roleEmpty")}</ComboboxEmpty>
                    <ComboboxList>
                      {(item: AuditRole) => (
                        <ComboboxItem key={item.code} value={item}>
                          {labels.role(item.code)}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            ) : null}

            {selectableScopes.length < 2 ? (
              <p className="text-xs text-muted-foreground">
                {tAudit("scopeLockedNote", {
                  role: role ? labels.role(role) : "—",
                })}
              </p>
            ) : null}
          </div>

          <AuditChartAndTable
            scope={effectiveScope}
            employeeRows={auditRows.employeeRows}
            departmentRows={auditRows.departmentRows}
            roleCodes={roleCodes}
            loading={auditRows.loading}
            error={auditRows.error}
            departmentId={departmentId}
            seriesLabel={tAudit("rankingSeries")}
            periodLabel={selectedPeriodLabel}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
