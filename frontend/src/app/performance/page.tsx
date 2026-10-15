"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listKpiPointRules,
  personalKpiDashboard,
} from "@/lib/mock/services/performance";
import { useSession } from "@/lib/mock/session";

export default function PerformancePage() {
  const { viewer } = useSession();
  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(0);

  useEffect(() => {
    const now = new Date();
    setYear(now.getUTCFullYear());
    setMonth(now.getUTCMonth() + 1);
  }, []);

  const prevMonth = () => {
    setMonth((m) => (m === 1 ? 12 : m - 1));
    setYear((y) => (month === 1 ? y - 1 : y));
  };
  const nextMonth = () => {
    setMonth((m) => (m === 12 ? 1 : m + 1));
    setYear((y) => (month === 12 ? y + 1 : y));
  };

  if (!viewer) return null;

  const dash = personalKpiDashboard(viewer, year, month);
  const rules = listKpiPointRules();

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Performance
            </h1>
            <p className="text-muted-foreground text-sm">
              Personal KPI dashboard ({viewer.roles[0]?.code})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={prevMonth}>
              ‹
            </Button>
            <span className="text-sm font-medium">
              {new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
                undefined,
                { month: "long", year: "numeric" },
              )}
            </span>
            <Button variant="outline" size="sm" onClick={nextMonth}>
              ›
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-none border border-border">
            <CardHeader>
              <CardTitle>Total KPI Score</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="text-3xl font-mono font-bold">
                {dash.totalKpiScore}
              </div>
            </CardContent>
          </Card>
          <Card className="shadow-none border border-border">
            <CardHeader>
              <CardTitle>AL Balance</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {dash.leaveBalances.find((b) => b.leaveCode === "AL")
                ?.balanceDays ?? 0}{" "}
              days
            </CardContent>
          </Card>
          <Card className="shadow-none border border-border">
            <CardHeader>
              <CardTitle>TOIL Balance</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {dash.leaveBalances.find((b) => b.leaveCode === "TOIL")
                ?.balanceDays ?? 0}{" "}
              days
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Point rules</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead className="w-32">Event</TableHead>
                <TableHead className="w-16">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => (
                <TableRow key={r.code}>
                  <TableCell className="text-xs">{r.code}</TableCell>
                  <TableCell className="text-xs">{r.event}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {r.points > 0 ? "+" : ""}
                    {r.points}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Recent KPI events</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead className="w-20">Points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dash.recentEvents.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs font-mono">
                    {new Date(e.occurredAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{e.ruleCode}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {e.points > 0 ? "+" : ""}
                    {e.points}
                  </TableCell>
                </TableRow>
              ))}
              {dash.recentEvents.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-muted-foreground text-center py-4"
                  >
                    No events.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
}
