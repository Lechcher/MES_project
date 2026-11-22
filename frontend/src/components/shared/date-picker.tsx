"use client";

import { CalendarDays } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMesFormat } from "@/lib/mes/i18n/format";
import { parseIsoDateValue, toIsoDateValue } from "./date-values";

/**
 * Date picker over the shadcn Calendar, keeping the app's `YYYY-MM-DD`
 * string value at its seams — a drop-in replacement for `<input type="date">`
 * with the design system's look.
 */
export function DatePicker({
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
  /** `YYYY-MM-DD`, or an empty string when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"button">, "value" | "onChange">) {
  const fmt = useMesFormat();
  const selected = parseIsoDateValue(value);

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
        <CalendarDays aria-hidden />
        <span className={value ? "text-foreground" : undefined}>
          {value
            ? fmt.date(value)
            : (placeholder ?? fmt.date(toIsoDateValue(new Date())))}
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? new Date()}
          onSelect={(date) => onChange(date ? toIsoDateValue(date) : "")}
        />
      </PopoverContent>
    </Popover>
  );
}
