"use client";

import { StateBadge } from "@/components/shared/state-badge";
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
import { acceptTask, listTasks } from "@/lib/mock/services/jobs";
import { useSession } from "@/lib/mock/session";

export default function QuickAddPage() {
  const { viewer } = useSession();
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 86400000);

  const { nodes } = listTasks(viewer, {
    state: "REQ",
    endDateAfter: start.toISOString(),
    endDateBefore: end.toISOString(),
    offset: 0,
    limit: 50,
  });

  if (!viewer) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Daily Quick-add
          </h1>
          <p className="text-muted-foreground text-sm">
            Unconfirmed{" "}
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            REQ tickets.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Task</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="w-16">Priority</TableHead>
                <TableHead className="w-20">Deadline</TableHead>
                <TableHead className="w-24">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {nodes.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-mono text-xs">
                    {task.taskCode}
                  </TableCell>
                  <TableCell>{task.title}</TableCell>
                  <TableCell className="text-xs">{task.priority}</TableCell>
                  <TableCell className="text-xs font-mono">
                    {task.endDate
                      ? new Date(task.endDate).toISOString().slice(11, 16)
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      onClick={() => {
                        acceptTask(task.id, viewer);
                      }}
                    >
                      Accept
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {nodes.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground text-center py-4"
                  >
                    No unconfirmed REQ tickets today.
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
