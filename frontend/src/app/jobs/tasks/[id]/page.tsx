"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  acceptTask,
  approveTask,
  cancelTask,
  getTask,
  returnTask,
  submitTaskReport,
} from "@/lib/mock/services/jobs";
import { useSession } from "@/lib/mock/session";

type Params = { id: string };

export default function TaskDetailPage() {
  const params = useParams<Params>();
  const { viewer, can } = useSession();
  const router = useRouter();
  const [task, setTask] = useState<any>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    if (!viewer || !params.id) return;
    const t = getTask(viewer, params.id);
    setTask(t);
    if (!t) setError("Task not found or out of scope");
  }, [viewer, params.id]);

  const refresh = () => {
    if (!viewer || !params.id) return;
    const t = getTask(viewer, params.id);
    setTask(t);
    setOk("");
    setError("");
  };

  const action = async (fn: () => any) => {
    if (!viewer || !params.id) return;
    try {
      await fn();
      refresh();
      setOk("Action applied.");
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  if (!viewer) return null;
  if (!task) return <div className="p-6">Loading…</div>;

  const canAccept =
    can("jobs.ticket.accept_report") &&
    task.state === "REQ" &&
    task.assignedTo?.id === viewer.id;
  const canReport = can("jobs.ticket.accept_report") && task.state === "ACT";
  const canApproveReturn =
    can("jobs.ticket.approve_return") && task.state === "PEN";
  const canCancel =
    can("jobs.ticket.cancel") &&
    task.state !== "APP" &&
    task.state !== "CAN" &&
    task.assignedTo?.id === viewer.id;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Ticket {task.taskCode}
            </h1>
            <p className="text-muted-foreground text-sm">{task.title}</p>
          </div>
          <div className="flex items-center gap-2">
            <StateBadge code={task.state} variant="state" />
            <Button onClick={() => refresh()} size="sm">
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded border border-destructive/50 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}
        {ok && (
          <div className="mb-4 p-3 rounded border border-primary/50 bg-primary/10 text-primary text-sm">
            {ok}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="shadow-none border border-border">
            <CardHeader>
              <CardTitle>State</CardTitle>
              <CardDescription>{task.state}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {task.isOverdue ? (
                <span className="text-destructive font-medium">Overdue</span>
              ) : (
                <span className="text-muted-foreground">On track</span>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-none border border-border">
            <CardHeader>
              <CardTitle>Priority</CardTitle>
              <CardDescription>{task.priority}</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">{task.taskType}</CardContent>
          </Card>
          <Card className="shadow-none border border-border">
            <CardHeader>
              <CardTitle>Progress</CardTitle>
              <CardDescription>{task.progressPercentage}%</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {task.assignedTo?.fullName ?? "Unassigned"}
            </CardContent>
          </Card>
          <Card className="shadow-none border border-border">
            <CardHeader>
              <CardTitle>Deadline</CardTitle>
              <CardDescription>
                {task.endDate
                  ? new Date(task.endDate).toISOString().slice(0, 10)
                  : "—"}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {task.project?.name ?? "General Operations"}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Description</h2>
          <p className="text-muted-foreground">
            {task.description ?? "No description."}
          </p>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Actions</h2>
          <div className="flex flex-wrap gap-2">
            {canAccept && (
              <Button onClick={() => action(() => acceptTask(task.id, viewer))}>
                Accept (REQ &rarr; ACT)
              </Button>
            )}
            {canReport && (
              <Button
                onClick={() => action(() => submitTaskReport(task.id, viewer))}
              >
                Submit Report (ACT &rarr; PEN)
              </Button>
            )}
            {canApproveReturn && (
              <>
                <Button
                  onClick={() => action(() => approveTask(task.id, viewer))}
                >
                  Approve (PEN &rarr; APP)
                </Button>
                <Button
                  onClick={() => {
                    const r = window.prompt("Return reason:");
                    if (r) action(() => returnTask(task.id, viewer, r));
                  }}
                >
                  Return (PEN &rarr; REJ)
                </Button>
              </>
            )}
            {canCancel && (
              <Button
                onClick={() => {
                  const r = window.prompt("Cancel reason (mandatory):");
                  if (r) action(() => cancelTask(task.id, viewer, r));
                }}
                variant="destructive"
              >
                Cancel (&rarr; CAN)
              </Button>
            )}
            {!canAccept && !canReport && !canApproveReturn && !canCancel && (
              <span className="text-xs text-muted-foreground">
                No available actions for your role/state.
              </span>
            )}
          </div>
        </div>

        <Separator className="mt-8" />

        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Transition History</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">When</TableHead>
                <TableHead className="w-20">From &rarr; To</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {task.stateTransitions.map((tr: any) => (
                <TableRow key={tr.id}>
                  <TableCell className="text-xs font-mono">
                    {new Date(tr.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">
                    {tr.fromState ?? "—"} &rarr; {tr.toState}
                  </TableCell>
                  <TableCell className="text-xs">
                    {tr.actor?.fullName ?? "system"}
                  </TableCell>
                  <TableCell className="text-xs">{tr.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
              {task.stateTransitions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground text-center py-4"
                  >
                    No transitions.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-6">
          <h2 className="text-sm font-semibold mb-2">Requests</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Type</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-20">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {task.requests.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.requestType}</TableCell>
                  <TableCell className="text-xs">{r.reason}</TableCell>
                  <TableCell className="text-xs">{r.status}</TableCell>
                </TableRow>
              ))}
              {task.requests.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-muted-foreground text-center py-4"
                  >
                    No requests.
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
