"use client";

import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toMesApiError } from "@/lib/mes/errors";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { cn } from "@/lib/utils";

/**
 * Uniform loading, empty and error states.
 *
 * A failed request always renders its `MesApiError` in the active locale
 * (an API-supplied message passes through untranslated) and never substitutes
 * fixture data for a successful response.
 */

export function LoadingState({
  label = "Loading…",
  rows = 3,
  className,
}: {
  label?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col gap-2 py-4", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count placeholder rows
          key={index}
          className="h-9 w-full"
        />
      ))}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function EmptyState({
  title = "No records",
  description,
  action,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 border border-border px-6 py-10 text-center",
        className,
      )}
    >
      <Inbox className="size-5 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-prose text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const errorText = useErrorText();
  if (!error) return null;
  const apiError = toMesApiError(error);
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 border border-destructive border-l-4 bg-destructive/5 px-4 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-destructive"
          aria-hidden
        />
        <div>
          <p className="text-sm font-medium text-destructive">
            {errorText(error)}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {apiError.code}
          </p>
        </div>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" className="w-fit" onClick={onRetry}>
          <RefreshCw data-icon="inline-start" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function InlineAlert({
  tone,
  children,
  className,
}: {
  tone: "error" | "success" | "info";
  children: ReactNode;
  className?: string;
}) {
  const toneClasses: Record<"error" | "success" | "info", string> = {
    error: "border-destructive text-destructive bg-destructive/5",
    success: "text-foreground",
    info: "border-border text-foreground bg-muted",
  };
  const toneStyle =
    tone === "success"
      ? { borderColor: "#24a148", backgroundColor: "#24a1481a" }
      : undefined;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "border border-l-4 px-3 py-2 text-sm",
        toneClasses[tone],
        className,
      )}
      style={toneStyle}
    >
      {children}
    </div>
  );
}
