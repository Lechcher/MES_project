"use client";

import type { DragEventData } from "@neodrag/react";
import { useDraggable } from "@neodrag/react";
import { cn } from "cn";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Copy,
  type LucideIcon,
  MoreHorizontal,
  Star,
  Trash2,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { TICKET_STATE_BY_CODE } from "@/lib/mes/queries/registries";
import type { ScheduledTask, TaskType, UserRef } from "@/lib/mes/queries/types";
import { addDays, isMidnight, rowForLaneOffset } from "./schedule-range";

/**
 * One ticket bar on the schedule.
 *
 * The bar sits on a light surface; its 1 px border carries the ticket-state
 * color and its left stripe carries the category, so state and category read
 * independently (design D1/D2 of `improve-schedule-bars-editor-and-rows`).
 * Rows hold several lanes, so the bar knows its own lane and the lane counts
 * of every row to resolve a drop. Writers can drag the bar: the drop snaps to
 * the grid, moves or reassigns the ticket, and Alt (Option) drops a copy
 * instead. The bar's transform is reset after the drop — its new position
 * comes from the merged query state — and the overflow menu offers the same
 * actions to keyboard users.
 */

const CATEGORY: Record<TaskType, { icon: LucideIcon; stripe: string }> = {
  DAILY: { icon: CalendarDays, stripe: "border-l-primary" },
  MULTI_DAY: { icon: CalendarRange, stripe: "border-l-[#8a3ffc]" },
  HOURLY: { icon: Zap, stripe: "border-l-destructive" },
};

const PRIORITY_STARS: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
};

export interface TicketBarMove {
  user: UserRef;
  delta: number;
  copy: boolean;
}

export function TicketBar({
  task,
  placement,
  colWidth,
  rowHeight,
  rowIndex,
  rows,
  laneCounts,
  lane,
  canWrite,
  boundsElement,
  continuesBefore,
  continuesAfter,
  onOpen,
  onMove,
  onDuplicate,
  onDelete,
}: {
  task: ScheduledTask;
  placement: { start: number; span: number };
  colWidth: number;
  rowHeight: number;
  rowIndex: number;
  rows: { user: UserRef }[];
  /** Lanes per row, in render order — the drag's row target. */
  laneCounts: number[];
  /** 0-based sub-row this bar occupies inside its row. */
  lane: number;
  canWrite: boolean;
  boundsElement: HTMLElement | null;
  continuesBefore: boolean;
  continuesAfter: boolean;
  onOpen: (task: ScheduledTask) => void;
  onMove: (task: ScheduledTask, move: TicketBarMove) => void;
  onDuplicate: (task: ScheduledTask) => void;
  onDelete: (task: ScheduledTask) => void;
}) {
  const t = useTranslations("planning.schedule");
  const labels = useDomainLabels();
  const fmt = useMesFormat();
  const movedRef = useRef(false);

  const state = TICKET_STATE_BY_CODE[task.state];
  const category = CATEGORY[task.taskType];
  const wide = placement.span >= 2;
  const CategoryIcon = category.icon;
  const stars = PRIORITY_STARS[task.priority] ?? 2;

  const drag = useDraggable({
    // Columns snap to the scale's width. The vertical axis is left free
    // (`0` step) because a row is as tall as its lane count, not a fixed 52px:
    // the drop is counted in lanes below, so a taller row is not harder to
    // drop out of than a short one.
    grid: [colWidth, 0],
    bounds: (node) =>
      boundsElement?.getBoundingClientRect() ?? node.getBoundingClientRect(),
    disabled: !canWrite,
    onDragEnd: (event: DragEventData) => {
      // The transform never persists: the merged state decides where the bar
      // sits, so a failed save rolls the bar back to its slot.
      if (event.node instanceof HTMLElement) event.node.style.transform = "";
      const delta = Math.round(event.offset.x / colWidth);
      // `rowHeight` is one lane's height: rows grow in whole lanes, so the
      // vertical drop is counted in lanes rather than in the row's pixels.
      const rowDelta = Math.round(event.offset.y / rowHeight);
      movedRef.current = delta !== 0 || rowDelta !== 0;
      if (delta === 0 && rowDelta === 0) return;
      // Rows grow with their lane count, so the vertical offset is counted in
      // lanes and resolved through the row that owns the target lane.
      const firstLane = laneCounts
        .slice(0, rowIndex)
        .reduce((sum, count) => sum + Math.max(1, count), 0);
      const targetRow = rowForLaneOffset(
        laneCounts,
        firstLane + lane + rowDelta,
      );
      const target = rows[targetRow];
      if (!target) return;
      onMove(task, {
        user: target.user,
        delta,
        copy: event.input.modifiers.alt,
      });
    },
  });

  const handle = canWrite ? drag.ref : undefined;
  // neodrag's `cancel` is a factory: calling it yields the no-drag ref.
  const cancelRef = canWrite ? drag.cancel() : undefined;

  // The bar's headline: its scheduled range in its category's unit. An hourly
  // bar reads its hours, a daily bar its date, and a multi-day bar its dates.
  const rangeLabel = (() => {
    if (!task.startDate) return null;
    if (task.taskType === "HOURLY") {
      return task.endDate
        ? `${fmt.time(task.startDate)}–${fmt.time(task.endDate)}`
        : fmt.time(task.startDate);
    }
    if (task.taskType === "MULTI_DAY") {
      const endAt = task.endDate ? new Date(task.endDate) : null;
      // A midnight end is an inclusive end day, so the last day it shows is
      // the one before it.
      const endShown =
        endAt && !Number.isNaN(endAt.getTime()) && isMidnight(endAt)
          ? addDays(endAt, -1)
          : endAt;
      return endShown && !Number.isNaN(endShown.getTime())
        ? `${fmt.date(task.startDate)}–${fmt.date(
            endShown ? endShown.toISOString() : null,
          )}`
        : fmt.date(task.startDate);
    }
    return fmt.date(task.startDate);
  })();

  const tooltip = [
    `${task.taskCode} · ${task.title}`,
    labels.taskType(task.taskType),
    `${labels.priority(task.priority)} (${stars}★)`,
    labels.ticketState(task.state),
    task.startDate
      ? `${fmt.dateTime(task.startDate)} → ${fmt.dateTime(task.endDate)}`
      : null,
    task.assignedTo ? task.assignedTo.fullName : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    // A <button> cannot contain the overflow-menu trigger below, so the bar
    // is a div carrying the button role explicitly.
    // biome-ignore lint/a11y/useSemanticElements: nests a menu trigger
    <div
      ref={handle}
      role="button"
      tabIndex={0}
      aria-label={tooltip}
      title={tooltip}
      // The category and state read from the DOM so the schedule's e2e checks
      // can assert a bar's encoding without reading its colors.
      data-task-type={task.taskType}
      data-ticket-state={task.state}
      onClick={() => {
        if (movedRef.current) {
          movedRef.current = false;
          return;
        }
        onOpen(task);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(task);
        }
      }}
      className={cn(
        "group relative z-10 m-[3px] flex cursor-pointer items-center gap-1 overflow-hidden border border-l-4 px-1.5 text-left text-xs whitespace-nowrap select-none",
        category.stripe,
        canWrite ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
      )}
      style={{
        gridColumn: `${placement.start + 2} / span ${placement.span}`,
        // Lanes are grid rows one ROW_HEIGHT tall, so the bar's lane decides
        // which of them it occupies.
        gridRow: `${lane + 1} / span 1`,
        backgroundColor: "#f4f4f4",
        borderColor: state.hex,
        color: "#161616",
      }}
    >
      <CategoryIcon className="size-3.5 shrink-0" aria-hidden />

      {continuesBefore ? (
        <ChevronLeft
          className="absolute left-0.5 size-3 opacity-80"
          aria-label={t("bar.continuesBefore")}
        />
      ) : null}
      {continuesAfter ? (
        <ChevronRight
          className="absolute right-0.5 size-3 opacity-80"
          aria-label={t("bar.continuesAfter")}
        />
      ) : null}

      <span className="truncate font-mono">{task.taskCode}</span>
      {rangeLabel ? (
        <span
          className={cn(
            "font-mono opacity-80",
            // Hours have to stay legible; a date range may give way.
            task.taskType === "HOURLY"
              ? "shrink-0"
              : "min-w-0 truncate font-medium",
          )}
        >
          {rangeLabel}
        </span>
      ) : null}
      {wide ? (
        <>
          <span className="truncate font-medium">{task.title}</span>
          <span className="ml-auto shrink-0 truncate opacity-80">
            {labels.ticketState(task.state)}
          </span>
        </>
      ) : null}

      {task.taskType === "HOURLY" ? (
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {task.isUrgentHourly ? (
            wide ? (
              <span className="flex items-center gap-0.5 bg-foreground/10 px-1 py-px">
                <Star className="size-2.5 fill-current" aria-hidden />
                {t("bar.urgent")}
              </span>
            ) : (
              <Star className="size-2.5 fill-current" aria-hidden />
            )
          ) : null}
        </span>
      ) : null}

      {task.taskType === "MULTI_DAY" ? (
        <span
          className="absolute inset-x-0 bottom-0 h-1 bg-black/25"
          aria-hidden
        >
          <span
            className="block h-full bg-current"
            style={{
              width: `${Math.min(100, Math.max(0, task.progressPercentage))}%`,
            }}
          />
        </span>
      ) : null}

      <span
        ref={cancelRef}
        className="absolute right-0.5 top-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-xs" }),
              "text-current hover:bg-gray/15 hover:text-current",
            )}
            aria-label={t("bar.menu", { code: task.taskCode })}
            onClick={(event) => event.stopPropagation()}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => onOpen(task)}>
              {t("bar.open")}
            </DropdownMenuItem>
            {canWrite ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDuplicate(task)}>
                  <Copy data-icon="inline-start" />
                  {t("bar.duplicate")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(task)}
                >
                  <Trash2 data-icon="inline-start" />
                  {t("bar.delete")}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
