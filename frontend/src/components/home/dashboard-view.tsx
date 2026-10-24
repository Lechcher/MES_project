"use client";

import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ScrollText,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import {
  appAccessFor,
  type MesModuleCode,
  visibleApps,
} from "@/lib/mes/navigation";
import { useViewer } from "@/lib/mes/session";

const ICONS: Record<MesModuleCode, typeof Briefcase> = {
  jobs: Briefcase,
  planning: CalendarDays,
  performance: BarChart3,
  settings: Settings2,
  "audit-log": ScrollText,
};

export function DashboardView() {
  const viewer = useViewer();
  const t = useTranslations("shell");
  const labels = useDomainLabels();
  if (!viewer) return null;

  const apps = visibleApps(viewer);

  return (
    <section>
      <p className="text-xs tracking-widest text-muted-foreground uppercase">
        {t("dashboard.eyebrow")}
      </p>
      <h1 className="mt-3 text-3xl font-light text-foreground">
        {t("dashboard.welcome", { name: viewer.fullName })}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {viewer.roles.map((role) => labels.role(role.code)).join(", ")} ·{" "}
        {viewer.department?.name ?? t("nav.noDepartment")}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {apps.map((app) => {
          const Icon = ICONS[app.code];
          // HR's Settings launcher is user-directory-only; the description
          // says so in the active locale.
          const description =
            app.code === "settings" &&
            appAccessFor(viewer, "settings") === "USER_DIRECTORY_ONLY"
              ? t("apps.settings.userDirectoryOnly")
              : t(`apps.${app.code}.description`);
          return (
            <Link key={app.code} href={app.href} className="block">
              <Card className="h-full transition-colors hover:bg-muted">
                <CardHeader>
                  <Icon className="size-6 text-primary" />
                  <CardTitle>{labels.module(app.code)}</CardTitle>
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
