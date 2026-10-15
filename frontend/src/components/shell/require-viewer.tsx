"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/mock/session";

export function RequireViewer({ children }: { children: React.ReactNode }) {
  const { viewer } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!viewer) {
      router.replace("/signin");
    }
  }, [viewer, router]);

  if (!viewer) return null;
  return <>{children}</>;
}
