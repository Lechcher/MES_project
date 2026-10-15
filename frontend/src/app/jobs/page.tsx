"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/mock/session";
import { listTasks } from "@/lib/mock/services/jobs";
import { StateBadge } from "@/components/shared/state-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { Plus } from "lucide-react";

type StateFilter = "REQ" | "ACT" | "PEN" | "APP" | "REJ" | "CAN" | "OVERDUE" | "";
type PriorityFilter = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | "";
type TypeFilter = "HOURLY" | "DAILY" | "MULTI_DAY" | "";

const DAYS = [
  { key: "yesterday" as const, label: "Yesterday", offset: -1 },
  { key: "today" as const, label: "Today", offset: 0 },
  { key: "tomorrow" as const, label: "Tomorrow", offset: 1 },
];

export default function JobsPage() {
  const { viewer } = useSession();
  const [day, setDay] = useState<"yesterday" | "today" | "tomorrow">("today");
  const [stateFilter, setStateFilter] = useState<StateFilter>("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("");
  const [overdue, setOverdue] = useState(false);
  const [urgent, setUrgent] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  if (!viewer) return null;

  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const target = startOfDay(new Date(now));
  target.setUTCDate(target.getUTCDate() + DAYS.find((d) => d.key === day)!.offset);
  const targetIso = target.toISOString();
  const nextIso = new Date(target.getTime() + 86400000).toISOString();

  const filter = {
    state: stateFilter || undefined,
    priority: priorityFilter || undefined,
    taskType: typeFilter || undefined,
    isOverdue: overdue || undefined,
    isUrgentHourly: urgent || undefined,
    search: search || undefined,
    offset: page * 20,
    limit: 20,
    endDateAfter: targetIso,
    endDateBefore: nextIso,
  };

  const { nodes, pageInfo } = listTasks(viewer, filter);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Jobs</h1>
            <p className="text-muted-foreground text-sm">
              Role-scoped ticket list ({viewer.roles[0]?.code})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => {}}>+ Create New Ticket</Button>
          </div>
        </div>

        {/* Day navigation */}
        <div className="flex items-center gap-2 mb-4">
          {DAYS.map((d) => (
            <Button
              key={d.key}
              variant={day === d.key ? "default" : "outline"}
              className="px-3 text-sm"
              onClick={() => setDay(d.key)}
            >
              [{d.label}]
            </Button>
          ))}
        </div>

        {/* Filters */}
        <div className="grid gap-3 md:grid-cols-12 mb-4">
          <div className="md:col-span-3">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" className="w-full text-left">
                  State: {stateFilter || "All"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>State</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={stateFilter === ""}
                    onCheckedChange={() => setStateFilter("")}
                  >
                    All
                  </DropdownMenuCheckboxItem>
                  {["REQ", "ACT", "PEN", "APP", "REJ", "CAN", "OVERDUE"].map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s}
                      checked={stateFilter === s}
                      onCheckedChange={() => setStateFilter(s as StateFilter)}
                    >
                      {s}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="md:col-span-3">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" className="w-full text-left">
                  Priority: {priorityFilter || "All"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuCheckboxItem checked={priorityFilter === ""} onCheckedChange={() => setPriorityFilter("")}>
                    All
                  </DropdownMenuCheckboxItem>
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p}
                      checked={priorityFilter === p}
                      onCheckedChange={() => setPriorityFilter(p as PriorityFilter)}
                    >
                      {p}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="md:col-span-3">
            <DropdownMenu>
              <DropdownMenuTrigger>
                <Button variant="outline" className="w-full text-left">
                  Type: {typeFilter || "All"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuCheckboxItem checked={typeFilter === ""} onCheckedChange={() => setTypeFilter("")}>
                    All
                  </DropdownMenuCheckboxItem>
                  {["HOURLY", "DAILY", "MULTI_DAY"].map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t}
                      checked={typeFilter === t}
                      onCheckedChange={() => setTypeFilter(t as TypeFilter)}
                    >
                      {t.replace("_", " ")}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button
              variant={overdue ? "default" : "outline"}
              size="sm"
              onClick={() => setOverdue(!overdue)}
            >
              Overdue
            </Button>
            <Button
              variant={urgent ? "default" : "outline"}
              size="sm"
              onClick={() => setUrgent(!urgent)}
            >
              Urgent
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search task code, title, assignee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md"
          />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Task</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-16">State</TableHead>
                <TableHead className="w-16">Priority</TableHead>
                <TableHead className="w-16">Type</TableHead>
                <TableHead className="w-20">Progress</TableHead>
                <TableHead className="w-32">Assignee</TableHead>
                <TableHead className="w-24">Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-mono text-xs">{task.taskCode}</TableCell>
                  <TableCell>{task.title}</TableCell>
                  <TableCell><StateBadge code={task.state} variant="state" /></TableCell>
                  <TableCell className="text-xs">{task.priority}</TableCell>
                  <TableCell className="text-xs">{task.taskType}</TableCell>
                  <TableCell className="text-xs">{task.progressPercentage}%</TableCell>
                  <TableCell className="text-xs">{task.assignedTo?.fullName ?? "—"}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {task.endDate ? new Date(task.endDate).toISOString().slice(0, 10) : "—"}
                  </TableCell>
                </TableRow>
              ))}
              {nodes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground text-center py-4">
                    No tasks found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between mt-6">
          <div className="text-xs text-muted-foreground">
            Showing {pageInfo.offset + 1}–{Math.min(pageInfo.offset + nodes.length, pageInfo.totalCount)} of {pageInfo.totalCount}
          </div>
          <Pagination>
            <PaginationContent>
              {pageInfo.totalCount > 20 && (
                <>
                  <PaginationItem key="prev">
                    <PaginationLink
                      onClick={() => page > 0 && setPage((p) => Math.max(p - 1, 0))}
                    >
                      Prev
                    </PaginationLink>
                  </PaginationItem>
                  <PaginationItem key="next">
                    <PaginationLink
                      onClick={() => pageInfo.hasNextPage && setPage((p) => p + 1)}
                    >
                      Next
                    </PaginationLink>
                  </PaginationItem>
                </>
              )}
            </PaginationContent>
          </Pagination>
        </div>
      </main>
    </div>
  );
}
