"use client";

import { Badge } from "@/components/ui/badge";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import {
  LEAVE_CODE_BY_CODE,
  TICKET_STATE_BY_CODE,
} from "@/lib/mes/queries/registries";
import type { LeaveCode, TicketStateCode } from "@/lib/mes/queries/types";

type StateBadgeProps = {
  code: TicketStateCode | LeaveCode;
  variant?: "state" | "leave";
  /**
   * Render the label truncated for dense calendar cells; the full name stays
   * available through the badge's `title`.
   */
  compact?: boolean;
  className?: string;
};

/**
 * Ticket-state and leave-code badge.
 *
 * The active locale's name renders alone — never the code token — in the
 * documented color: `REQ` White (outline), `ACT` Yellow, `PEN` Blue, `APP`
 * Green, `REJ` Orange, `CAN` Red, `OVERDUE` Red (Warning).
 */
export function StateBadge({
  code,
  variant = "state",
  compact = false,
  className,
}: StateBadgeProps) {
  const labels = useDomainLabels();

  if (variant === "leave") {
    const leaveCode = code as LeaveCode;
    const hex = LEAVE_CODE_BY_CODE[leaveCode]?.hex ?? "#525252";
    const name = labels.leaveCode(leaveCode);
    return (
      <Badge
        variant="outline"
        title={name}
        className={className}
        style={{
          backgroundColor: `${hex}1a`,
          borderColor: hex,
          color: hex,
        }}
      >
        <span
          className={
            compact ? "block max-w-24 truncate align-bottom" : undefined
          }
        >
          {name}
        </span>
      </Badge>
    );
  }

  const ticketStateCode = code as TicketStateCode;
  const hex = TICKET_STATE_BY_CODE[ticketStateCode]?.hex ?? "#525252";
  const name = labels.ticketState(ticketStateCode);
  const isOutline = code === "REQ";
  const onDark = code !== "REQ" && code !== "ACT";

  return (
    <Badge
      variant={isOutline ? "outline" : "default"}
      title={name}
      className={className}
      style={
        isOutline
          ? {
              borderColor: "#161616",
              color: "#161616",
              backgroundColor: "transparent",
            }
          : { backgroundColor: hex, color: onDark ? "#ffffff" : "#161616" }
      }
    >
      <span
        className={compact ? "block max-w-24 truncate align-bottom" : undefined}
      >
        {name}
      </span>
    </Badge>
  );
}
