"use client";

import { cn } from "cn";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { EmptyState } from "@/components/shared/query-states";
import { StateBadge } from "@/components/shared/state-badge";
import { Button } from "@/components/ui/button";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { LEAVE_CODE_BY_CODE } from "@/lib/mes/queries/registries";
import type {
  LeaveCode,
  MatrixCalendarDay,
  ScheduledTask,
  ScheduleRange,
  UserRef,
} from "@/lib/mes/queries/types";
import {
  addDays,
  addHours,
  addMonths,
  isMidnight,
  placeBar,
  startOfMonth,
  toIsoDate,
} from "./schedule-range";
import { TicketBar, type TicketBarMove } from "./ticket-bar";

/**
 * The schedule body: a sticky employee column grouped by department, one row
 * per employee and one column per time unit, with leave badges and late or
 * early-leave marks on the affected days (design D1/D4). Bars are grid
 * items, so placement needs no measurement; the fixed column and row sizes
 * drive the drag grid snap.
 */

const EMPLOYEE_COL_PX = 224; // 14rem
const COL_WIDTH_BY_SCALE = { DAY: 88, WEEK: 128, MONTH: 96, YEAR: 132 };
const ROW_HEIGHT = 52;

export interface ScheduleGridRow {
  user: UserRef;
  departmentName: string | null;
  /** Day-key (`YYYY-MM-DD`) → the attendance mark for that day. */
  marks: Map<string, MatrixCalendarDay>;
  tasks: ScheduledTask[];
}

export function ScheduleGrid({
  range,
  cols,
  rows,
  canWrite,
  canWriteTask,
  onCellClick,
  onOpenTask,
  onMoveTask,
  onDuplicateTask,
  onDeleteTask,
}: {
  range: ScheduleRange;
  cols: Date[];
  rows: ScheduleGridRow[];
  canWrite: boolean;
  canWriteTask: (task: ScheduledTask) => boolean;
  onCellClick: (user: UserRef, column: Date) => void;
  onOpenTask: (task: ScheduledTask) => void;
  onMoveTask: (task: ScheduledTask, move: TicketBarMove) => void;
  onDuplicateTask: (task: ScheduledTask) => void;
  onDeleteTask: (task: ScheduledTask) => void;
}) {
  const t = useTranslations("planning.schedule");
  const fmt = useMesFormat();
  const bodyRef = useRef<HTMLDivElement>(null);

  const colWidth = COL_WIDTH_BY_SCALE[range.scale];
  const gridTemplate = `${EMPLOYEE_COL_PX}px repeat(${cols.length}, ${colWidth}px)`;
  const todayKey = toIsoDate(new Date());
  const isDayScale = range.scale === "DAY";
  const isYearScale = range.scale === "YEAR";

  // The exclusive end of the last column, for "continues later" indicators.
  const lastCol = cols[cols.length - 1];
  const lastColEnd = lastCol
    ? isDayScale
      ? addHours(lastCol, 1)
      : isYearScale
        ? addMonths(startOfMonth(lastCol), 1)
        : addDays(lastCol, 1)
    : null;

  // Group the rows by department, keeping the incoming user order.
  const groups: { name: string | null; rows: ScheduleGridRow[] }[] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.name === row.departmentName) {
      last.rows.push(row);
    } else {
      groups.push({ name: row.departmentName, rows: [row] });
    }
  }

  return (
    <div className="border border-border">
      <div ref={bodyRef} className="overflow-x-auto">
        <div style={{ minWidth: EMPLOYEE_COL_PX + cols.length * colWidth }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 grid border-b border-border bg-background"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="sticky left-0 z-30 border-r border-border bg-background px-3 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("colEmployee")}
            </div>
            {cols.map((col) => {
              const dayKey = toIsoDate(col);
              const isToday =
                (isYearScale &&
                  col.getFullYear() === new Date().getFullYear() &&
                  col.getMonth() === new Date().getMonth()) ||
                (!isYearScale && dayKey === todayKey);
              return (
                <div
                  key={col.toISOString()}
                  className={cn(
                    "px-2 py-1.5 text-center text-xs whitespace-nowrap",
                    isToday && "bg-accent font-semibold text-foreground",
                  )}
                >
                  {isDayScale
                    ? `${String(col.getHours()).padStart(2, "0")}:00`
                    : isYearScale
                      ? `${fmt.monthShort(col)} ${col.getFullYear()}`
                      : `${fmt.weekdayShort(col)} ${col.getDate()}`}
                </div>
              );
            })}
          </div>

          {/* Department groups */}
          {groups.map((group) => (
            <div key={group.name ?? "none"}>
              {groups.length > 1 ? (
                <div
                  className="border-b border-border bg-muted/60 px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                  style={{ gridColumn: `1 / -1` }}
                >
                  {group.name ?? t("noDepartment")}
                </div>
              ) : null}
              {group.rows.map((row) => {
                const globalRowIndex = rows.indexOf(row);
                return (
                  <div
                    key={row.user.id}
                    className="grid border-b border-border last:border-b-0"
                    style={{
                      gridTemplateColumns: gridTemplate,
                      height: ROW_HEIGHT,
                    }}
                  >
                    <div className="sticky left-0 z-[5] flex items-center gap-2 overflow-hidden border-r border-border bg-background px-3">
                      <span className="truncate text-sm">
                        {row.user.fullName}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {row.user.userCode}
                      </span>
                    </div>

                    {cols.map((col, index) => {
                      const dayKey = toIsoDate(col);
                      const mark = row.marks.get(dayKey);
                      const isWeekend =
                        col.getDay() === 0 || col.getDay() === 6;
                      const markHex = mark?.leaveCode
                        ? LEAVE_CODE_BY_CODE[mark.leaveCode]?.hex
                        : null;
                      return (
                        <div
                          key={col.toISOString()}
                          className={cn(
                            "relative border-l border-border",
                            isWeekend && "bg-muted/40",
                          )}
                          style={{
                            gridRow: "1",
                            gridColumn: index + 2,
                            backgroundColor: markHex
                              ? `${markHex}14`
                              : undefined,
                          }}
                        >
                          {canWrite ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="absolute inset-0 h-full w-full rounded-none opacity-0 focus-visible:opacity-100"
                              aria-label={`${row.user.fullName} · ${fmt.date(col.toISOString())}`}
                              onClick={() => onCellClick(row.user, col)}
                            />
                          ) : null}

                          {mark && !isYearScale ? (
                            <>
                              {mark.leaveCode ? (
                                <span
                                  className={cn(
                                    "absolute bottom-0.5",
                                    isDayScale && col.getHours() !== 0
                                      ? "hidden"
                                      : "left-0.5",
                                  )}
                                >
                                  <StateBadge
                                    variant="leave"
                                    code={mark.leaveCode}
                                    compact
                                  />
                                </span>
                              ) : null}
                              {mark.isLate ? (
                                <span className="absolute top-0.5 right-0.5 bg-[#f1c21b] px-1 text-[10px] leading-4 text-[#161616]">
                                  {t("lateMark")}
                                </span>
                              ) : null}
                              {mark.isEarlyLeave ? (
                                <span className="absolute top-0.5 right-0.5 bg-[#ee5c25] px-1 text-[10px] leading-4 text-white">
                                  {t("earlyLeaveMark")}
                                </span>
                              ) : null}
                            </>
                          ) : null}

                          {isYearScale ? (
                            <MonthMarks
                              monthKey={`${dayKey.slice(0, 7)}`}
                              marks={row.marks}
                            />
                          ) : null}
                        </div>
                      );
                    })}

                    {row.tasks.map((task) => {
                      const placement = placeBar(task, cols, range.scale);
                      if (!placement) return null;
                      const startAt = task.startDate
                        ? new Date(task.startDate)
                        : null;
                      const endAt = task.endDate
                        ? new Date(task.endDate)
                        : null;
                      const exclusiveEnd =
                        endAt && lastColEnd
                          ? isYearScale
                            ? addMonths(startOfMonth(endAt), 1)
                            : isMidnight(endAt)
                              ? addDays(endAt, 1)
                              : endAt
                          : null;
                      return (
                        <TicketBar
                          key={task.id}
                          task={task}
                          placement={placement}
                          colWidth={colWidth}
                          rowHeight={ROW_HEIGHT}
                          rowIndex={globalRowIndex}
                          rows={rows}
                          canWrite={canWriteTask(task)}
                          boundsElement={bodyRef.current}
                          continuesBefore={Boolean(
                            startAt && cols[0] && startAt < cols[0],
                          )}
                          continuesAfter={Boolean(
                            exclusiveEnd &&
                              lastColEnd &&
                              exclusiveEnd > lastColEnd,
                          )}
                          onOpen={onOpenTask}
                          onMove={onMoveTask}
                          onDuplicate={onDuplicateTask}
                          onDelete={onDeleteTask}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}

          {rows.length === 0 ? (
            <EmptyState
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Year-scale marks: one column per month, so the day marks aggregate into a
 * compact chip per leave code plus a late count.
 */
function MonthMarks({
  monthKey,
  marks,
}: {
  monthKey: string;
  marks: Map<string, MatrixCalendarDay>;
}) {
  const t = useTranslations("planning.schedule");
  const leaveCounts = new Map<LeaveCode, number>();
  let lateCount = 0;
  for (const [dayKey, mark] of marks) {
    if (!dayKey.startsWith(monthKey)) continue;
    if (mark.leaveCode) {
      leaveCounts.set(
        mark.leaveCode,
        (leaveCounts.get(mark.leaveCode) ?? 0) + 1,
      );
    }
    if (mark.isLate) lateCount += 1;
  }
  if (leaveCounts.size === 0 && lateCount === 0) return null;
  return (
    <span className="absolute inset-0 flex items-center gap-1 overflow-hidden px-1">
      {[...leaveCounts.entries()].slice(0, 2).map(([code, count]) => (
        <span key={code} className="flex items-center gap-0.5">
          <StateBadge variant="leave" code={code} compact />
          {count > 1 ? (
            <span className="text-[10px] text-muted-foreground">×{count}</span>
          ) : null}
        </span>
      ))}
      {lateCount > 0 ? (
        <span className="bg-[#f1c21b] px-1 text-[10px] leading-4 text-[#161616]">
          {t("lateMark")} ×{lateCount}
        </span>
      ) : null}
    </span>
  );
}
