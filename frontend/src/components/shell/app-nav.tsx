"use client";

import Link from "next/link";
import { useSession } from "@/lib/mock/session";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

const APPS = [
  { key: "dashboard", label: "Home", href: "/" },
  { key: "jobs", label: "Jobs", href: "/jobs" },
  { key: "planning", label: "Planning", href: "/planning" },
  { key: "performance", label: "Performance", href: "/performance" },
  { key: "settings", label: "Settings", href: "/settings" },
];

const APPS_ALLOWED: Record<string, string[]> = {
  SUPER_ADMIN: ["dashboard", "jobs", "planning", "performance", "settings"],
  TECH_LEAD: ["dashboard", "jobs", "planning", "performance", "settings"],
  HR_MANAGER: ["dashboard", "jobs", "planning", "performance", "settings"],
  DEPT_HEAD: ["dashboard", "jobs", "planning", "performance"],
  EMPLOYEE: ["dashboard", "jobs", "planning", "performance"],
};

export function AppNav() {
  const { viewer, can, signOut } = useSession();
  if (!viewer) return null;
  const role = viewer.roles[0]?.code ?? "EMPLOYEE";
  const allowed = APPS_ALLOWED[role] ?? [];

  return (
    <nav className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight">MES Prototype</Link>
          <div className="hidden md:flex items-center gap-2">
            {APPS.filter((a) => allowed.includes(a.key)).map((app) => (
              <Link
                key={app.key}
                href={app.href}
                className="text-sm font-medium text-foreground hover:text-primary transition-colors"
              >
                {app.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline" className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-sm">{viewer.fullName}</span>
                <span className="text-xs text-muted-foreground">{viewer.roles[0]?.code}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem className="text-sm">
                {viewer.department?.name} &middot; {viewer.roles[0]?.code}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-sm text-muted-foreground cursor-default" disabled>
                Switch account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={signOut} className="text-sm text-destructive">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </nav>
  );
}
