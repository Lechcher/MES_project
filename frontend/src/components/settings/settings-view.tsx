"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { OrgStructure } from "@/components/settings/org-structure";
import { RbacPanel } from "@/components/settings/rbac";
import { SystemAuditLogsPanel } from "@/components/settings/system-audit-logs";
import { TelegramWebhookPanel } from "@/components/settings/telegram-webhook";
import { UserDirectory } from "@/components/settings/user-directory";
import { AppPageHeader } from "@/components/shared/app-page-header";
import { EmptyState } from "@/components/shared/query-states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { type SettingsMenu, settingsMenusFor } from "@/lib/mes/queries/access";
import type { RoleCode } from "@/lib/mes/queries/types";
import { useRoleCode, useViewer } from "@/lib/mes/session";

/**
 * Settings & IAM. Menu visibility is role-gated: `SUPER_ADMIN` and `TECH_LEAD`
 * see every menu; `HR_MANAGER` sees the User Directory only; `EMPLOYEE` and
 * `DEPT_HEAD` cannot open the app.
 */
/** Catalogue key for each settings menu. */
const MENU_KEYS = {
  users: "menuUsers",
  org: "menuOrg",
  rbac: "menuRbac",
  telegram: "menuTelegram",
  audit: "menuAudit",
} as const;

export function SettingsView() {
  const viewer = useViewer();
  const role = useRoleCode() as RoleCode | null;
  const t = useTranslations("settings.view");
  const labels = useDomainLabels();
  const [tab, setTab] = useState<SettingsMenu>("users");

  if (!viewer) return null;

  const menus = settingsMenusFor(role);

  if (menus.length === 0) {
    return (
      <div>
        <AppPageHeader
          eyebrow={labels.module("settings")}
          title={t("title")}
          description={t("hiddenDescription")}
        />
        <EmptyState
          title={t("noAccessTitle")}
          description={t("noAccessDescription")}
        />
      </div>
    );
  }

  const activeTab = menus.includes(tab) ? tab : menus[0];

  return (
    <div>
      <AppPageHeader
        eyebrow={labels.module("settings")}
        title={t("title")}
        description={
          role === "HR_MANAGER"
            ? t("hrDescription")
            : t("fullDescription", { role: role ? labels.role(role) : "—" })
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(value) => setTab(value as SettingsMenu)}
      >
        <TabsList variant="line">
          {menus.map((menu) => (
            <TabsTrigger key={menu} value={menu}>
              {t(MENU_KEYS[menu])}
            </TabsTrigger>
          ))}
        </TabsList>

        {menus.includes("users") ? (
          <TabsContent value="users" className="mt-6">
            <UserDirectory />
          </TabsContent>
        ) : null}
        {menus.includes("org") ? (
          <TabsContent value="org" className="mt-6">
            <OrgStructure />
          </TabsContent>
        ) : null}
        {menus.includes("rbac") ? (
          <TabsContent value="rbac" className="mt-6">
            <RbacPanel />
          </TabsContent>
        ) : null}
        {menus.includes("telegram") ? (
          <TabsContent value="telegram" className="mt-6">
            <TelegramWebhookPanel />
          </TabsContent>
        ) : null}
        {menus.includes("audit") ? (
          <TabsContent value="audit" className="mt-6">
            <SystemAuditLogsPanel />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
