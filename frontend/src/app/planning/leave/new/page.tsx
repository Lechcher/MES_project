"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/mock/session";
import { registerLeave } from "@/lib/mock/services/planning";
import { LEAVE_CODES } from "@/lib/mock/registries";
import { users } from "@/lib/mock/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function CreateLeavePage() {
  const { viewer } = useSession();
  const router = useRouter();
  const [leaveCode, setLeaveCode] = useState("AL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [handoverId, setHandoverId] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  if (!viewer) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await registerLeave(viewer, {
        leaveCode: leaveCode as any,
        startDate,
        endDate,
        reason,
        handoverUserId: handoverId || undefined,
      });
      setOk("Leave request registered (status: PENDING).");
      setTimeout(() => router.push("/planning"), 800);
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  const handoverOptions = users.filter((u) => u.id !== viewer.id);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Create Leave Request</h1>
          <p className="text-muted-foreground text-sm">
            Submission starts with status PENDING and routes to your approver.
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
        <form onSubmit={submit} className="max-w-lg space-y-4">
          <Card className="shadow-none border border-border p-4">
            <CardHeader><CardTitle>Leave request</CardTitle></CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Leave code</Label>
                  <Select value={leaveCode} onValueChange={(v) => setLeaveCode(v as any)}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAVE_CODES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.code} &mdash; {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Handover person</Label>
                  <Select value={handoverId} onValueChange={(v) => setHandoverId(v as string)}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {handoverOptions.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.fullName} ({u.roles[0]?.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                Attachment: filename only (mock — no file upload).
              </div>
            </CardContent>
          </Card>
          <Separator />
          <div className="flex gap-2">
            <Button type="submit">Register Leave</Button>
            <Button type="button" onClick={() => router.push("/planning")} variant="outline">
              Cancel
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
