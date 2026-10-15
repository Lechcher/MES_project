"use client";

import { useState } from "react";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { departments } from "@/lib/mock/db";
import { matrixCalendar } from "@/lib/mock/services/planning";
import { useSession } from "@/lib/mock/session";

export default function PlanningPage() {
  const { viewer } = useSession();
  const [monthOffset, setMonthOffset] = useState(0);
  const [deptId, setDeptId] = useState<string>("");

  if (!viewer) return null;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const viewMonth = month + monthOffset;
  const viewYear = year + Math.floor((viewMonth - 1) / 12);
  const viewMonthNorm = ((viewMonth - 1) % 12) + 1;

  const from = new Date(Date.UTC(viewYear, viewMonthNorm - 1, 1));
  const to = new Date(Date.UTC(viewYear, viewMonthNorm, 0));

  const cal = matrixCalendar(viewer, {
    departmentId: deptId || undefined,
    fromDate: from.toISOString(),
    toDate: to.toISOString(),
  });

  const monthName = from.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // build day headers
  const dayHeaders: Date[] = [];
  let d = new Date(from);
  while (d <= to) {
    dayHeaders.push(new Date(d));
    d = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Planning</h1>
            <p className="text-muted-foreground text-sm">
              Matrix calendar ({viewer.roles[0]?.code})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonthOffset((o) => o - 1)}
            >
              ‹
            </Button>
            <span className="text-sm font-medium">{monthName}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMonthOffset((o) => o + 1)}
            >
              ›
            </Button>
            <Select
              value={deptId}
              onValueChange={(v) => setDeptId(v as string)}
              disabled
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All departments</SelectItem>
                {departments.map((dp) => (
                  <SelectItem key={dp.id} value={dp.id}>
                    {dp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto border border-border rounded">
          <Table className="text-xs">
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Employee / Department</TableHead>
                {dayHeaders.map((day) => (
                  <TableHead
                    key={day.toISOString()}
                    className="w-10 text-center"
                  >
                    {day.getUTCDate()}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cal.rows.map((row) => {
                const leaveByDay: Record<string, string | undefined> = {};
                row.days.forEach((cd) => {
                  if (cd.leaveCode) leaveByDay[cd.workDate] = cd.leaveCode;
                });
                return (
                  <TableRow key={row.user.id}>
                    <TableCell className="font-medium">
                      {row.user.fullName}{" "}
                      <span className="text-xs text-muted-foreground">
                        ({row.user.roles[0]?.code})
                      </span>
                    </TableCell>
                    {dayHeaders.map((day) => {
                      const leaveCode =
                        leaveByDay[day.toISOString().slice(0, 10)];
                      return (
                        <TableCell
                          key={day.toISOString()}
                          className="text-center p-0"
                        >
                          <div className="flex items-center justify-center gap-1 h-6">
                            {leaveCode ? (
                              <StateBadge
                                code={leaveCode as any}
                                variant="leave"
                              />
                            ) : (
                              <span className="text-[10px] text-muted-foreground">
                                —
                              </span>
                            )}
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
              {cal.rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={dayHeaders.length + 1}
                    className="text-muted-foreground text-center py-4"
                  >
                    No data.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          Leave badges show the leave code on the day cell. Role scoping:
          Employee sees personal, Department Head sees department, HR/Tech
          Lead/Super Admin see company-wide.
        </div>
      </main>
    </div>
  );
}
