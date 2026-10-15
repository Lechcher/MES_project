import { Badge } from "@/components/ui/badge";
import {
  LEAVE_CODE_BY_CODE,
  LEAVE_CODE_VISUALS,
  TICKET_STATE_BY_CODE,
  TICKET_STATE_VISUALS,
} from "@/lib/mock/registries";
import type { LeaveCode, TicketStateCode } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

/**
 * Registry-driven ticket-state badge. Displays the code verbatim, with the
 * documented name and color (per the permission matrix's state color table).
 */
export function StateBadge({
  code,
  className,
}: {
  code: TicketStateCode;
  className?: string;
}) {
  const state = TICKET_STATE_BY_CODE[code];
  const visual = TICKET_STATE_VISUALS[code];
  return (
    <Badge
      title={state.name}
      className={cn("rounded-badge px-1.5 font-mono", visual.className, className)}
    >
      {code}
    </Badge>
  );
}

/**
 * Registry-driven leave badge. Displays the leave code verbatim (the official
 * badge for approved leave; `UAL`/`USL` render in the error color).
 */
export function LeaveBadge({
  code,
  className,
}: {
  code: LeaveCode;
  className?: string;
}) {
  const info = LEAVE_CODE_BY_CODE[code];
  const visual = LEAVE_CODE_VISUALS[code];
  return (
    <Badge
      title={info.name}
      className={cn("rounded-badge px-1.5 font-mono", visual.className, className)}
    >
      {code}
    </Badge>
  );
}
