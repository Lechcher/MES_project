"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import type { ExportResult } from "@/lib/mes/queries/types";
import { useMutation } from "@/lib/mes/session";
import { InlineAlert } from "./query-states";

/**
 * Run a print/export mutation and open the returned `ExportResult.url`.
 *
 * The real mutations generate a file server-side; on failure the server's
 * message is surfaced inline. No fixture descriptor is substituted.
 */
export function useServerExport(mutation: string, resultKey: string) {
  const { run, loading, error, reset } =
    useMutation<Record<string, ExportResult | null>>(mutation);
  const [result, setResult] = useState<ExportResult | null>(null);

  const execute = useCallback(
    async (variables?: Record<string, unknown>) => {
      try {
        const data = await run(variables);
        const next = data?.[resultKey] ?? null;
        setResult(next);
        if (next?.url) {
          window.open(next.url, "_blank", "noopener,noreferrer");
        }
        return next;
      } catch {
        return null;
      }
    },
    [run, resultKey],
  );

  return { execute, loading, error, result, reset };
}

export function ExportButton({
  mutation,
  resultKey,
  variables,
  label,
  variant = "outline",
  size = "sm",
  disabled,
}: {
  mutation: string;
  resultKey: string;
  variables?: Record<string, unknown>;
  label: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm";
  disabled?: boolean;
}) {
  const { execute, loading, error } = useServerExport(mutation, resultKey);
  const errorText = useErrorText();
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant={variant}
        size={size}
        disabled={disabled || loading}
        onClick={() => execute(variables)}
      >
        {loading ? "Generating…" : label}
      </Button>
      {error ? (
        <InlineAlert tone="error">{errorText(error)}</InlineAlert>
      ) : null}
    </div>
  );
}
