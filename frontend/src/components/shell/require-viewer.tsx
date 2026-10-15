"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useViewer } from "@/lib/mock/session";

/**
 * Guards app routes: any route without an established viewer redirects to the
 * sign-in page (the session is ephemeral and clears on reload).
 */
export function RequireViewer({ children }: { children: React.ReactNode }) {
  const viewer = useViewer();
  const router = useRouter();

  useEffect(() => {
    if (!viewer) router.replace("/signin");
  }, [viewer, router]);

  if (!viewer) return null;
  return <>{children}</>;
}
