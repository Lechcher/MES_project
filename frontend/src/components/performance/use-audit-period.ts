"use client";

/**
 * The audit surface's rows for a selected period and scope.
 *
 * The audit levels aggregate one `(periodYear, periodMonth)` pair, so a
 * selection of several months is assembled from one request per month and
 * merged client-side. The reads all issue together — none waits on another —
 * and a month that does not resolve simply drops out of the merge instead of
 * failing the whole surface.
 */

import { useEffect, useRef, useState } from "react";
import {
  type AuditDepartmentRow,
  type AuditEmployeeRow,
  type AuditEmployeeRowInput,
  type AuditRole,
  mergeAuditDepartmentRows,
  mergeAuditEmployeeRows,
  personalAuditRow,
} from "@/lib/mes/audit-merge";
import type { AuditPeriod } from "@/lib/mes/audit-period";
import { graphqlRequest } from "@/lib/mes/client";
import { type MesApiError, toMesApiError } from "@/lib/mes/errors";
import type {
  AuditCompanySource,
  AuditDepartmentSource,
  AuditEmployeeListSource,
  AuditScopeCode,
} from "@/lib/mes/queries/access";
import {
  AUDIT_ROW_FIELDS,
  type AuditRowSource,
  KPI_AUDIT_QUERY,
  PERSONAL_KPI_DASHBOARD_QUERY,
} from "@/lib/mes/queries/performance";
import type {
  Connection,
  KpiAuditLevel1Row,
  KpiAuditLevel2Row,
  KpiAuditLevel3Row,
  KpiPeriodSummary,
  UserRef,
} from "@/lib/mes/queries/types";
import { auditFilterVariables } from "./audit-filter";

/** Rows the audit levels return per page; a period's rows fit well inside it. */
const AUDIT_ROW_LIMIT = 200;

export interface UseAuditPeriodArgs {
  /** The months the selection covers, oldest first. */
  months: AuditPeriod[];
  /** The row grain currently selected. */
  scope: AuditScopeCode;
  companySource: AuditCompanySource;
  departmentSource: AuditDepartmentSource;
  /** The authorized read for the per-department employee grain. */
  employeeListSource: AuditEmployeeListSource;
  /**
   * The department the per-department employee grain narrows to. Ignored by the
   * other grains, so it cannot change what company-wide ranking means.
   */
  departmentId?: string | null;
  /** The viewer's own identity, used when the row source is personal. */
  viewer?: { id: string; fullName: string; roles?: AuditRole[] } | null;
}

export interface AuditPeriodState {
  /** Employee-level rows; empty when the department grain is selected. */
  employeeRows: AuditEmployeeRow[];
  /** Department-level rows; only populated for the department grain. */
  departmentRows: AuditDepartmentRow[];
  loading: boolean;
  error: MesApiError | null;
}

/** The rows one audit read returns. */
type AuditRead =
  | { kind: "employee"; nodes: AuditEmployeeRowInput[] }
  | { kind: "department"; nodes: KpiAuditLevel2Row[] };

async function readAuditPeriod(
  source: AuditRowSource,
  period: AuditPeriod,
  departmentId?: string | null,
): Promise<AuditRead> {
  const field = AUDIT_ROW_FIELDS[source];
  const data = await graphqlRequest<Record<string, Connection<unknown>>>(
    KPI_AUDIT_QUERY(source),
    {
      // `departmentId` narrows the read to one department's employees. It is
      // applied by the per-department grain only — passing it to a roll-up read
      // would silently change what company-wide ranking means.
      variables: auditFilterVariables(period, departmentId, AUDIT_ROW_LIMIT),
    },
  );
  const connection = data[field];
  const nodes = connection?.nodes ?? [];
  return source === "level2"
    ? { kind: "department", nodes: nodes as KpiAuditLevel2Row[] }
    : {
        kind: "employee",
        nodes: nodes as (KpiAuditLevel1Row | KpiAuditLevel3Row)[],
      };
}

/** The viewer's own row for one month, read from their personal dashboard. */
async function readPersonalPeriod(
  period: AuditPeriod,
  viewer: NonNullable<UseAuditPeriodArgs["viewer"]>,
): Promise<AuditRead> {
  const data = await graphqlRequest<{
    personalKpiDashboard: { summary: KpiPeriodSummary | null };
  }>(PERSONAL_KPI_DASHBOARD_QUERY, {
    variables: {
      input: {
        months: [
          {
            periodYear: period.periodYear,
            periodMonth: period.periodMonth,
          },
        ],
      },
    },
  });
  const summary = data.personalKpiDashboard?.summary ?? null;
  return {
    kind: "employee",
    nodes: summary
      ? [
          personalAuditRow(
            summary,
            {
              id: viewer.id,
              fullName: viewer.fullName,
              roles: viewer.roles,
            } as UserRef,
            null,
          ),
        ]
      : [],
  };
}

export function useAuditPeriod({
  months,
  scope,
  companySource,
  departmentSource,
  employeeListSource,
  departmentId,
  viewer,
}: UseAuditPeriodArgs): AuditPeriodState {
  // The read depends on the grain, so serialize the inputs that pick it.
  const [state, setState] = useState<AuditPeriodState>({
    employeeRows: [],
    departmentRows: [],
    loading: true,
    error: null,
  });

  // The caller builds a fresh viewer object on every render, so the effect
  // depends on the viewer's identity rather than on the object itself:
  // depending on the object would re-run the effect — and the reads it
  // starts — on every render, forever. The latest viewer is read through a
  // ref so a run always sees the current one.
  const latestViewer = useRef(viewer);
  useEffect(() => {
    latestViewer.current = viewer;
  }, [viewer]);

  const serialized = JSON.stringify({
    months,
    scope,
    companySource,
    departmentSource,
    employeeListSource,
    departmentId,
    viewerId: viewer?.id,
    viewerRoles: viewer?.roles?.map((role) => role.code) ?? [],
  });

  useEffect(() => {
    const controller = new AbortController();
    const wanted = JSON.parse(serialized) as Omit<
      UseAuditPeriodArgs,
      "viewer"
    > & { viewerId?: string };

    const wantsDepartments = wanted.scope === "department";
    const wantsDepartmentEmployees = wanted.scope === "employees-in-department";
    const departmentSource = wanted.departmentSource;
    const companySource = wanted.companySource;
    const employeeListSource = wanted.employeeListSource;

    // Nothing authorized to read for this grain — the component shows the
    // empty state rather than issuing a doomed request.
    if (wantsDepartments && departmentSource === null) {
      setState({
        employeeRows: [],
        departmentRows: [],
        loading: false,
        error: null,
      });
      return () => controller.abort();
    }

    // The per-department grain narrows only once a department is chosen. Until
    // then there are no rows to ask for, so the surface prompts instead.
    if (wantsDepartmentEmployees && !wanted.departmentId) {
      setState({
        employeeRows: [],
        departmentRows: [],
        loading: false,
        error: null,
      });
      return () => controller.abort();
    }

    const readOne = (period: AuditPeriod): Promise<AuditRead | null> => {
      if (wantsDepartments) {
        return readAuditPeriod("level2", period);
      }
      if (wantsDepartmentEmployees) {
        // The server scopes the read itself, so the id is never invented here.
        return employeeListSource === "level3"
          ? readAuditPeriod("level3", period, wanted.departmentId)
          : Promise.resolve(null);
      }
      if (companySource === "personal") {
        const currentViewer = latestViewer.current;
        return currentViewer
          ? readPersonalPeriod(period, currentViewer)
          : Promise.resolve(null);
      }
      return readAuditPeriod(companySource, period);
    };

    setState((previous) => ({ ...previous, loading: true, error: null }));

    Promise.all(
      wanted.months.map((period) => readOne(period).catch(() => null)),
    )
      .then((reads) => {
        if (controller.signal.aborted) return;
        const employees: AuditEmployeeRowInput[] = [];
        const departments: KpiAuditLevel2Row[] = [];
        for (const read of reads) {
          if (!read) continue;
          if (read.kind === "department") departments.push(...read.nodes);
          else employees.push(...read.nodes);
        }
        setState({
          employeeRows: wantsDepartments
            ? []
            : mergeAuditEmployeeRows(employees),
          departmentRows: mergeAuditDepartmentRows(departments),
          loading: false,
          error: null,
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          employeeRows: [],
          departmentRows: [],
          loading: false,
          error: toMesApiError(cause),
        });
      });

    return () => controller.abort();
  }, [serialized]);

  return state;
}
