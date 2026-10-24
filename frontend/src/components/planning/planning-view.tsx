"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApprovalBoard } from "@/components/planning/approval-board";
import { AttendanceSummary } from "@/components/planning/attendance-summary";
import { LeaveRequestsSection } from "@/components/planning/leave-requests";
import { ScheduleView } from "@/components/planning/schedule/schedule-view";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import {
  canSeeApprovalBoard,
  seesCompanyCalendar,
} from "@/lib/mes/queries/access";
import type { RoleCode } from "@/lib/mes/queries/types";
import { useRoleCode, useViewer } from "@/lib/mes/session";

/**
 * Planning & Attendance: the Schedule, leave requests, the role-gated
 * Approval Board, and the attendance/leave-fund summary.
 */
export function PlanningView() {
  const t = useTranslations("planning.view");
  const labels = useDomainLabels();
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const [tab, setTab] = useState("calendar");

  if (!viewer) return null;

  const approver = canSeeApprovalBoard(role);
  const isCompanyScope = seesCompanyCalendar(role);

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("planning")}
        title={t("title")}
        description={t("roleScoped", { role: role ? labels.role(role) : "—" })}
        actions={
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/planning/leave/new" />}
          >
            {t("createLeave")}
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList variant="line">
          <TabsTrigger value="calendar">{t("tabCalendar")}</TabsTrigger>
          <TabsTrigger value="leave">{t("tabLeave")}</TabsTrigger>
          {approver ? (
            <TabsTrigger value="board">{t("tabBoard")}</TabsTrigger>
          ) : null}
          <TabsTrigger value="attendance">{t("tabAttendance")}</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <ScheduleView role={role} />
        </TabsContent>

        <TabsContent value="leave" className="mt-4">
          <LeaveRequestsSection
            role={role}
            title={t("leaveSectionTitle")}
            description={t("leaveSectionDescription")}
          />
        </TabsContent>

        {approver ? (
          <TabsContent value="board" className="mt-4">
            <ApprovalBoard role={role} isCompanyScope={isCompanyScope} />
          </TabsContent>
        ) : null}

        <TabsContent value="attendance" className="mt-4">
          <AttendanceSummary role={role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
