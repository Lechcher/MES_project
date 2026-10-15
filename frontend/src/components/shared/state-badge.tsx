"use client";

import { Badge } from "@/components/ui/badge";
import {
  LEAVE_CODE_BY_CODE,
  LEAVE_COLOR_HEX,
  STATE_COLOR_HEX,
  TICKET_STATE_BY_CODE,
} from "@/lib/mock/registries";
import type { LeaveCode, TicketStateCode } from "@/lib/mock/types";

type StateBadgeProps = {
  code: TicketStateCode | LeaveCode;
  variant?: "state" | "leave";
  className?: string;
};

export function StateBadge({
  code,
  variant = "state",
  className,
}: StateBadgeProps) {
  if (variant === "leave") {
    const info = LEAVE_CODE_BY_CODE[code as LeaveCode];
    const hex = LEAVE_COLOR_HEX[code as LeaveCode] ?? "#525252";
    return (
      <Badge
        variant="outline"
        className={[
          className,
          `border-transparent bg-[#${hex}]/10 text-[#${hex}]`,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {info.name} ({code})
      </Badge>
    );
  }
  const info = TICKET_STATE_BY_CODE[code as TicketStateCode];
  const hex = STATE_COLOR_HEX[code as TicketStateCode] ?? "#525252";
  const isOutline = code === "REQ";
  return (
    <Badge
      variant={isOutline ? "outline" : "default"}
      className={[
        className,
        isOutline
          ? "border-[#161616] text-[#161616]"
          : `bg-[#${hex}] text-white`,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {info.name} ({code})
    </Badge>
  );
}
