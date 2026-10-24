"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMesSession } from "@/lib/mes/session";

/**
 * Gate for the authenticated app shell.
 *
 * Shows a session-loading state while `/api/mes/session` resolves and redirects
 * to `/signin` when there is no viewer.
 */
export function RequireViewer({ children }: { children: React.ReactNode }) {
  const { viewer, loading } = useMesSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !viewer) {
      router.replace("/signin");
    }
  }, [loading, viewer, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <span className="sr-only">Checking your session…</span>
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-52" />
        </div>
      </div>
    );
  }

  if (!viewer) return null;
  return <>{children}</>;
}
