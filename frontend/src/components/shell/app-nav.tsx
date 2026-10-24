"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { visibleApps } from "@/lib/mes/navigation";
import { useMesSession } from "@/lib/mes/session";
import { LanguageSwitcher } from "./language-switcher";
import { LiveStatusIndicator } from "./live-status";

export function AppNav() {
  const { viewer, signOut } = useMesSession();
  const router = useRouter();
  const t = useTranslations("shell");
  const labels = useDomainLabels();
  if (!viewer) return null;

  const apps = visibleApps(viewer);
  const primaryRole = viewer.roles[0];
  // Role names follow the active locale; the code stays the data contract.
  const primaryRoleName = primaryRole
    ? labels.role(primaryRole.code)
    : t("nav.noRole");

  const handleSignOut = async () => {
    await signOut();
    router.replace("/signin");
  };

  return (
    <nav className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between gap-4 px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Brand names stay verbatim in every locale by design. */}
          <Link href="/" className="font-semibold tracking-tight">
            ERP-MES System
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {t("nav.home")}
            </Link>
            {apps.map((app) => (
              <Link
                key={app.code}
                href={app.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                {t(`apps.${app.code}.short`)}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LiveStatusIndicator />
          <LanguageSwitcher />
          <DropdownMenu>
            {/* The trigger renders its own `<button>`, so composing the styled
                Button through `render` replaces it rather than nesting a second
                one — otherwise the DOM carries a button inside a button. */}
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  className="flex items-center gap-2 whitespace-nowrap"
                />
              }
            >
              <span className="text-sm">{viewer.fullName}</span>
              <span className="text-xs text-muted-foreground">
                {primaryRoleName}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem className="text-sm" disabled>
                {viewer.fullName}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-sm text-muted-foreground"
                disabled
              >
                {viewer.department?.name ?? t("nav.noDepartment")} ·{" "}
                {primaryRoleName}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                {t("nav.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
