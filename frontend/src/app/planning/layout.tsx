"use client";

import { RequireViewer } from "@/components/shell/require-viewer";

export default function PlanningLayout({ children }: { children: React.ReactNode }) {
  return <RequireViewer>{children}</RequireViewer>;
}
