"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/mock/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LayoutDashboard,
  Briefcase,
  Calendar,
  BarChart3,
  Settings as SettingsIcon,
  Users,
} from "lucide-react";

const ENTRIES = [
  { key: "jobs", label: "Jobs", href: "/jobs", icon: Briefcase, description: "Ticket lists, lifecycle and quick-add." },
  { key: "planning", label: "Planning", href: "/planning", icon: Calendar, description: "Matrix calendar, leave and attendance." },
  { key: "performance", label: "Performance", href: "/performance", icon: BarChart3, description: "KPI dashboard and audit tables." },
  { key: "settings", label: "Settings", href: "/settings", icon: SettingsIcon, description: "Users, org, RBAC and webhook." },
];

const SETTINGS_ALLOWED: Record<string, boolean> = {
  SUPER_ADMIN: true,
  TECH_LEAD: true,
  HR_MANAGER: true,
  DEPT_HEAD: false,
  EMPLOYEE: false,
};

export default function Home() {
  const { viewer } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!viewer) {
      router.replace("/signin");
    }
  }, [viewer, router]);

  if (!viewer) return null;
  const role = viewer.roles[0]?.code ?? "EMPLOYEE";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1 px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Home Page Dashboard</h1>
          <p className="text-muted-foreground">
            Select an app. Entries shown depend on your role ({viewer.roles[0]?.code}).
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {ENTRIES.filter((e) => {
            if (e.key === "settings") return SETTINGS_ALLOWED[role] ?? false;
            return true;
          }).map((entry) => {
            const Icon = entry.icon;
            return (
              <Card key={entry.key} className="shadow-none border border-border">
                <CardHeader>
                  <CardTitle>{entry.label}</CardTitle>
                  <CardDescription>{entry.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center gap-3 pt-4">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <Button
                    onClick={() => router.push(entry.href)}
                    className="w-auto flex-1 text-left border border-border hover:bg-primary hover:text-primary-foreground"
                  >
                    Open {entry.label}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
