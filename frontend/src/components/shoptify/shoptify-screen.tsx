"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { EmptyState } from "@/components/shared/query-states";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { canViewShoptifyApp } from "@/lib/mes/queries/access";
import type { RoleCode } from "@/lib/mes/queries/types";
import { useRoleCode, useViewer } from "@/lib/mes/session";

/**
 * Role gate for every shoptify route.
 *
 * The launcher and top navigation hide the app from roles without commerce
 * access; this gate keeps a direct route from rendering the commerce shell
 * for those viewers. The server enforces the same matrix on every operation,
 * so the shell never carries data for a hidden role either way.
 */
export function ShoptifyScreen({ children }: { children: ReactNode }) {
  const t = useTranslations("shoptify");
  const labels = useDomainLabels();
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;

  if (!viewer) return null;

  if (!canViewShoptifyApp(role)) {
    return (
      <div>
        <AppPageHeader
          eyebrow={labels.module("shoptify")}
          title={labels.module("shoptify")}
          description={t("noAccessDescription")}
        />
        <EmptyState title={t("noAccessTitle")} />
      </div>
    );
  }

  return <>{children}</>;
}
