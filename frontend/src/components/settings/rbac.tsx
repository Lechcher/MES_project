"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  EmptyState,
  ErrorState,
  InlineAlert,
  LoadingState,
} from "@/components/shared/query-states";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import {
  PERMISSIONS_QUERY,
  ROLES_QUERY,
  UPDATE_ROLE_PERMISSIONS_MUTATION,
} from "@/lib/mes/queries/settings";
import type { PermissionRef, RoleDetail } from "@/lib/mes/queries/types";
import { useApiQuery } from "@/lib/mes/queries/use-api";
import { useMutation } from "@/lib/mes/session";

const MODULE_ORDER = [
  "jobs",
  "planning",
  "performance",
  "settings",
  "audit-log",
] as const;

/**
 * RBAC — the five roles with their permissions grouped by module, with
 * grant/revoke. Only `TECH_LEAD` and `SUPER_ADMIN` may access it (menu gating).
 */
export function RbacPanel() {
  const t = useTranslations("settings.rbac");
  const labels = useDomainLabels();
  const errorText = useErrorText();
  const rolesQuery = useApiQuery<{ roles: RoleDetail[] }>(
    ROLES_QUERY,
    {},
    {
      liveArea: "users",
    },
  );
  const permissionsQuery = useApiQuery<{ permissions: PermissionRef[] }>(
    PERMISSIONS_QUERY,
    {},
    { liveArea: "users" },
  );
  const updatePermissions = useMutation<unknown>(
    UPDATE_ROLE_PERMISSIONS_MUTATION,
  );
  const [feedback, setFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const roles = rolesQuery.data?.roles ?? [];
  const allPermissions = permissionsQuery.data?.permissions ?? [];

  const grouped = MODULE_ORDER.map((moduleCode) => ({
    moduleCode,
    permissions: allPermissions.filter(
      (permission) => permission.moduleCode === moduleCode,
    ),
  })).filter((group) => group.permissions.length > 0);

  const toggle = async (
    role: RoleDetail,
    permission: PermissionRef,
    granted: boolean,
  ) => {
    setFeedback(null);
    const current = role.permissions.map((entry) => entry.code);
    const next = granted
      ? [...new Set([...current, permission.code])]
      : current.filter((code) => code !== permission.code);
    try {
      await updatePermissions.run({
        input: { roleId: role.id, permissionCodes: next },
      });
      setFeedback({
        tone: "success",
        message: granted
          ? t("grantedMsg", {
              permission: permission.code,
              role: labels.role(role.code),
            })
          : t("revokedMsg", {
              permission: permission.code,
              role: labels.role(role.code),
            }),
      });
      rolesQuery.refetch();
    } catch (cause) {
      setFeedback({
        tone: "error",
        message: errorText(cause),
      });
    }
  };

  if (rolesQuery.error) {
    return <ErrorState error={rolesQuery.error} onRetry={rolesQuery.refetch} />;
  }
  if (rolesQuery.loading && !rolesQuery.data) {
    return <LoadingState label={t("loading")} rows={4} />;
  }
  if (roles.length === 0) {
    return (
      <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      {feedback ? (
        <InlineAlert tone={feedback.tone}>{feedback.message}</InlineAlert>
      ) : null}

      {roles.map((role) => {
        const grantedCodes = new Set(
          role.permissions.map((permission) => permission.code),
        );
        return (
          <article key={role.id} className="border border-border p-4">
            <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {labels.role(role.code)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("grantedCount", { count: role.permissions.length })}
              </p>
            </header>
            {role.description ? (
              <p className="mb-3 text-xs text-muted-foreground">
                {role.description}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {grouped.map((group) => (
                <div key={group.moduleCode}>
                  <p className="mb-1 text-xs text-muted-foreground">
                    {labels.module(group.moduleCode)}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {group.permissions.map((permission) => {
                      const id = `${role.id}-${permission.code}`;
                      return (
                        <li
                          key={permission.code}
                          className="flex items-start gap-2"
                        >
                          <Checkbox
                            id={id}
                            checked={grantedCodes.has(permission.code)}
                            disabled={updatePermissions.loading}
                            onCheckedChange={(checked) =>
                              toggle(role, permission, checked === true)
                            }
                          />
                          <Label htmlFor={id} className="text-xs leading-tight">
                            <span className="font-mono">{permission.code}</span>
                            {permission.description
                              ? ` — ${permission.description}`
                              : ""}
                          </Label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </section>
  );
}
