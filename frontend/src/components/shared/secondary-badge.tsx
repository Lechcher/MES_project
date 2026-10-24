"use client";

import { Badge } from "@/components/ui/badge";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import type { TaskStateBadge } from "@/lib/mes/queries/types";

/**
 * The `ACT` secondary badge (`API_CONTACT_SPECIFICATION.md` §6.1). The label
 * reads in the active locale — "Active — …" in English — with the live
 * progress percentage for `PROGRESS_UPDATE`.
 */
export function SecondaryBadge({
  badge,
  progressPercentage,
  className,
}: {
  badge: TaskStateBadge;
  progressPercentage?: number;
  className?: string;
}) {
  const labels = useDomainLabels();
  const label = labels.taskStateBadge(badge, progressPercentage);
  return (
    <Badge
      variant="outline"
      className={className}
      style={{
        borderColor: "#f1c21b",
        color: "#161616",
        backgroundColor: "#f1c21b33",
      }}
    >
      {label}
    </Badge>
  );
}
