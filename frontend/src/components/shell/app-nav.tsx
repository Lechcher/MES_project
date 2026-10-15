"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { visibleLauncherApps } from "@/lib/mock/permissions";
import { useSession, useViewer } from "@/lib/mock/session";
import { cn } from "@/lib/utils";

const APP_LABELS: Record<string, string> = {
  jobs: "Jobs",
  planning: "Planning",
  performance: "Performance",
  settings: "Settings",
};

export function AppNav() {
  const viewer = useViewer();
  const { signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (!viewer) return null;

  const navItems = [
    { code: "dashboard", name: "Dashboard", href: "/" },
    ...visibleLauncherApps(viewer).map((app) => ({
      code: app.code as string,
      name: APP_LABELS[app.code] ?? app.name,
      href: app.href,
    })),
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 h-12 border-b border-border bg-background">
      <div className="mx-auto flex h-full w-full max-w-[1312px] items-center gap-2 px-6">
        <Link
          href="/"
          className="mr-2 text-sm font-semibold tracking-wide text-foreground"
        >
          MES
        </Link>
        <nav className="flex h-full items-center">
          {navItems.map((item) => (
            <Link
              key={item.code}
              href={item.href}
              className={cn(
                "flex h-full items-center border-b-2 border-transparent px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
                isActive(item.href) && "border-primary font-medium text-foreground",
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" className="gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {viewer.fullName}
                  </span>
                  <ChevronsUpDown className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <span className="block text-sm font-medium text-foreground">
                    {viewer.fullName}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {viewer.roles.map((role) => role.name).join(", ")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {viewer.department?.name ?? "No department"}
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  signOut();
                  router.push("/signin");
                }}
              >
                <RefreshCcw className="size-4" />
                Switch account
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  signOut();
                  router.push("/signin");
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
