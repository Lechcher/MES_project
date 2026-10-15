"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projects } from "@/lib/mock/db";
import { createTask } from "@/lib/mock/services/jobs";
import { useSession } from "@/lib/mock/session";

export default function CreateTicketPage() {
  const { viewer } = useSession();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<"HOURLY" | "DAILY" | "MULTI_DAY">(
    "DAILY",
  );
  const [priority, setPriority] = useState<
    "LOW" | "MEDIUM" | "HIGH" | "URGENT"
  >("MEDIUM");
  const [projectId, setProjectId] = useState<string>(projects[0].id);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  if (!viewer) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await createTask(viewer, {
        title,
        description,
        projectId,
        taskType,
        priority,
        assignedToId: viewer.id,
        departmentId: viewer.department?.id,
      });
      setOk("Ticket created.");
      setTitle("");
      router.push("/jobs");
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            Create New Ticket
          </h1>
          <p className="text-muted-foreground text-sm">
            Creates a {taskType} ticket in state REQ. Auto-forking replicates to
            department members when enabled.
          </p>
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
        <form onSubmit={submit} className="max-w-2xl space-y-4">
          <Card className="shadow-none border border-border p-4">
            <CardHeader>
              <CardTitle>Ticket details</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Task type</Label>
                  <Select
                    value={taskType}
                    onValueChange={(v) => setTaskType(v as any)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HOURLY">Hourly</SelectItem>
                      <SelectItem value="DAILY">Daily</SelectItem>
                      <SelectItem value="MULTI_DAY">Multi-day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={priority}
                    onValueChange={(v) => setPriority(v as any)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select
                    value={projectId}
                    onValueChange={(v) => setProjectId(v as string)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2">
            <Button type="submit">Create Ticket</Button>
            <Button
              type="button"
              onClick={() => router.push("/jobs")}
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
