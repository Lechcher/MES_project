"use client";

import { CalendarRange } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMesFormat } from "@/lib/mes/i18n/format";
import {
  type DateRangeValue,
  datesToRange,
  formatRangeLabel,
  rangeToDates,
} from "./date-values";

/**
 * Date-range picker over the shadcn Calendar (`mode="range"`), keeping the
 * app's two `YYYY-MM-DD` strings at its seams — the replacement for the
 * toolbar's typed `DD/MM/YYYY` pair.
 */
export function DateRangePicker({
  id,
  value,
  onChange,
  placeholder,
  disabled = false,
  invalid = false,
  className,
  ...props
}: {
  id?: string;
  /** The range as two `YYYY-MM-DD` strings; either side may be empty. */
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"button">, "value" | "onChange">) {
  const fmt = useMesFormat();
  const dates = rangeToDates(value);
  const label = formatRangeLabel(value, (iso) => fmt.date(iso));

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            aria-invalid={invalid || undefined}
            className={`w-full justify-start gap-2 font-normal text-muted-foreground ${className ?? ""}`}
            {...props}
          />
        }
      >
        <CalendarRange aria-hidden />
        <span
          className={value.from && value.to ? "text-foreground" : undefined}
        >
          {value.from || value.to ? label : placeholder}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={{ from: dates.from, to: dates.to }}
          defaultMonth={dates.from ?? new Date()}
          onSelect={(selection) => onChange(datesToRange(selection))}
        />
      </PopoverContent>
    </Popover>
  );
}
