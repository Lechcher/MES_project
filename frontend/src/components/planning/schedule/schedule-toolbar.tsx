"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileUp,
  Plus,
  Printer,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  addDays,
  formatDmy,
  parseDmy,
  SCALES,
} from "@/components/planning/schedule/schedule-range";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDomainLabels } from "@/lib/mes/i18n/labels";
import { TICKET_STATE_CODES } from "@/lib/mes/queries/registries";
import type {
  DepartmentRef,
  ExportFormat,
  ScheduleRange,
  ScheduleScale,
} from "@/lib/mes/queries/types";

const DAY_MS = 86_400_000;

/**
 * The schedule's control strip: ‹ Today ›, the scale toggle, the `DD/MM/YYYY`
 * custom range (validated inline), the department filter for company-scope
 * roles, and the actions — New, Import, the export menu with its state
 * filter, and the A4 attendance print (design D1).
 */
export function ScheduleToolbar({
  range,
  onNavigate,
  onToday,
  onScaleChange,
  onCustomRange,
  departments,
  departmentId,
  onDepartmentChange,
  showDepartmentFilter,
  canWrite,
  onNew,
  onImport,
  onExport,
  exportLoading,
  exportState,
  onExportStateChange,
  onPrint,
  printLoading,
}: {
  range: ScheduleRange;
  onNavigate: (dir: -1 | 1) => void;
  onToday: () => void;
  onScaleChange: (scale: ScheduleScale) => void;
  onCustomRange: (from: Date, to: Date) => void;
  departments: DepartmentRef[];
  departmentId: string;
  onDepartmentChange: (id: string) => void;
  showDepartmentFilter: boolean;
  canWrite: boolean;
  onNew: () => void;
  onImport: () => void;
  onExport: (format: ExportFormat) => void;
  exportLoading: boolean;
  exportState: string;
  onExportStateChange: (state: string) => void;
  onPrint: () => void;
  printLoading: boolean;
}) {
  const t = useTranslations("planning.schedule");
  const labels = useDomainLabels();

  const [fromText, setFromText] = useState(() => formatDmy(range.from));
  const [toText, setToText] = useState(() => formatDmy(addDays(range.to, -1)));
  const [rangeError, setRangeError] = useState<string | null>(null);

  // Keep the inputs in step with navigation without clobbering edits.
  useEffect(() => {
    setFromText(formatDmy(range.from));
    setToText(formatDmy(addDays(range.to, -1)));
    setRangeError(null);
  }, [range.from, range.to]);

  const applyCustomRange = () => {
    const from = parseDmy(fromText);
    const to = parseDmy(toText);
    if (!from || !to) {
      setRangeError(t("range.invalidDate"));
      return;
    }
    if (to.getTime() < from.getTime()) {
      setRangeError(t("range.endBeforeStart"));
      return;
    }
    if (Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1 > 366) {
      setRangeError(t("range.tooLong"));
      return;
    }
    setRangeError(null);
    onCustomRange(from, to);
  };

  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-3 border border-border p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* ‹ Today › and the scale toggle */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("previous")}
            onClick={() => onNavigate(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="sm" onClick={onToday}>
            {t("today")}
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={t("next")}
            onClick={() => onNavigate(1)}
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {SCALES.map((scale) => (
            <Button
              key={scale}
              variant={range.scale === scale ? "default" : "outline"}
              size="sm"
              aria-pressed={range.scale === scale}
              onClick={() => onScaleChange(scale)}
            >
              {t(`scale.${scale}`)}
            </Button>
          ))}
        </div>

        {/* Custom DD/MM/YYYY range */}
        <div className="flex flex-wrap items-end gap-1">
          <div className="grid gap-1">
            <Label htmlFor="schedule-range-from" className="text-xs">
              {t("range.from")}
            </Label>
            <Input
              id="schedule-range-from"
              value={fromText}
              onChange={(event) => setFromText(event.target.value)}
              placeholder={t("range.placeholder")}
              aria-invalid={rangeError !== null}
              className="w-28"
              inputMode="numeric"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="schedule-range-to" className="text-xs">
              {t("range.to")}
            </Label>
            <Input
              id="schedule-range-to"
              value={toText}
              onChange={(event) => setToText(event.target.value)}
              placeholder={t("range.placeholder")}
              aria-invalid={rangeError !== null}
              className="w-28"
              inputMode="numeric"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mb-0.5"
            onClick={applyCustomRange}
          >
            {t("range.apply")}
          </Button>
        </div>

        {rangeError ? (
          <p role="alert" className="text-xs text-destructive">
            {rangeError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          {showDepartmentFilter ? (
            <div className="grid gap-1">
              <Label htmlFor="schedule-department" className="text-xs">
                {t("departmentLabel")}
              </Label>
              <Select
                value={departmentId}
                onValueChange={(value) => onDepartmentChange(value ?? "")}
                items={{
                  "": t("allDepartments"),
                  ...Object.fromEntries(
                    departments.map((department) => [
                      department.id,
                      department.name,
                    ]),
                  ),
                }}
              >
                <SelectTrigger
                  id="schedule-department"
                  className="w-56"
                  size="sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t("allDepartments")}</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid gap-1">
            <Label htmlFor="schedule-export-state" className="text-xs">
              {t("exportStateLabel")}
            </Label>
            <Select
              value={exportState}
              onValueChange={(value) => onExportStateChange(value ?? "ALL")}
              items={{
                ALL: t("allStates"),
                ...Object.fromEntries(
                  TICKET_STATE_CODES.map((code) => [
                    code,
                    labels.ticketState(code),
                  ]),
                ),
              }}
            >
              <SelectTrigger
                id="schedule-export-state"
                className="w-44"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("allStates")}</SelectItem>
                {TICKET_STATE_CODES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {labels.ticketState(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrint}
            disabled={printLoading}
          >
            <Printer data-icon="inline-start" />
            {printLoading ? t("loading") : t("printCalendar")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" disabled={exportLoading}>
                  <Download data-icon="inline-start" />
                  {exportLoading ? t("loading") : t("export")}
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              {(["PDF", "XLSX", "CSV"] as const).map((format) => (
                <DropdownMenuItem key={format} onClick={() => onExport(format)}>
                  {t("exportAs", { format: labels.exportFormat(format) })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {canWrite ? (
            <>
              <Button variant="outline" size="sm" onClick={onImport}>
                <FileUp data-icon="inline-start" />
                {t("import")}
              </Button>
              <Button size="sm" onClick={onNew}>
                <Plus data-icon="inline-start" />
                {t("newTask")}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
