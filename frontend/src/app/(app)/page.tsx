"use client";

import Link from "next/link";
import { BarChart3, Briefcase, CalendarDays, Settings2 } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { appAccessFor, visibleLauncherApps } from "@/lib/mock/permissions";
import { useViewer } from "@/lib/mock/session";

const ICONS = {
  jobs: Briefcase,
  planning: CalendarDays,
  performance: BarChart3,
  settings: Settings2,
} as const;

const DESCRIPTIONS: Record<string, string> = {
  jobs: "Ticket lifecycle, progress, and acceptance.",
  planning: "Matrix work calendar, attendance, and leave.",
  performance: "Personal KPI dashboard and audit tables.",
  settings: "IAM, RBAC, and system configuration.",
};

export default function DashboardPage() {
  const viewer = useViewer();
  if (!viewer) return null;

  const apps = visibleLauncherApps(viewer);

  return (
    <section>
      <p className="text-xs tracking-widest text-muted-foreground uppercase">
        Home Page Dashboard
      </p>
      <h1 className="mt-3 text-3xl font-light text-foreground">
        Welcome, {viewer.fullName}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {viewer.roles.map((role) => role.name).join(", ")} ·{" "}
        {viewer.department?.name ?? "No department"}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {apps.map((app) => {
          const Icon = ICONS[app.code as keyof typeof ICONS] ?? Briefcase;
          const access = appAccessFor(viewer, app.code);
          const description =
            app.code === "settings" && access === "USER_DIRECTORY_ONLY"
              ? "User Directory only."
              : DESCRIPTIONS[app.code] ?? "";
          return (
            <Link key={app.code} href={app.href} className="block">
              <Card className="h-full transition-colors hover:bg-muted">
                <CardHeader>
                  <Icon className="size-6 text-primary" />
                  <CardTitle>{app.name}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
