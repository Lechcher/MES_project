"use client";

import { FileUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useServerExport } from "@/components/shared/export-action";
import { InlineAlert } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import {
  COMMIT_TASK_IMPORT_MUTATION,
  PREVIEW_TASK_IMPORT_MUTATION,
  TASK_IMPORT_TEMPLATE_MUTATION,
} from "@/lib/mes/queries/planning";
import type { TaskImportPreview } from "@/lib/mes/queries/types";
import { useMutation } from "@/lib/mes/session";

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Browser `ArrayBuffer` → base64, chunked to keep the call stack small. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

/**
 * The bulk-import flow: download the CSV or XLSX template, pick a file, see
 * the validation preview with per-row errors, and commit only when every
 * row is valid. The server re-validates on commit, so an invalid file never
 * creates anything.
 */
export function ImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (count: number) => void;
}) {
  const t = useTranslations("planning.schedule.importDialog");
  const common = useTranslations("common");
  const errorText = useErrorText();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const template = useServerExport(
    TASK_IMPORT_TEMPLATE_MUTATION,
    "taskImportTemplate",
  );
  const preview = useMutation<{ previewTaskImport: TaskImportPreview | null }>(
    PREVIEW_TASK_IMPORT_MUTATION,
  );
  const commit = useMutation<{ commitTaskImport: { id: string }[] | null }>(
    COMMIT_TASK_IMPORT_MUTATION,
  );

  const [file, setFile] = useState<{ name: string; base64: string } | null>(
    null,
  );
  const [result, setResult] = useState<TaskImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (open) return;
    setFile(null);
    setResult(null);
    setError(null);
    setDone(null);
    preview.reset();
    commit.reset();
  }, [open, preview, commit]);

  const pickFile = async (picked: File | null) => {
    setError(null);
    setResult(null);
    setDone(null);
    if (!picked) return;
    if (picked.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError(t("tooLarge"));
      return;
    }
    const base64 = toBase64(await picked.arrayBuffer());
    setFile({ name: picked.name, base64 });
  };

  const checkFile = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setDone(null);
    try {
      const data = await preview.run({
        file: { fileName: file.name, contentBase64: file.base64 },
      });
      setResult(data?.previewTaskImport ?? null);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const commitFile = async () => {
    if (!file || !result || result.errorCount > 0) return;
    setError(null);
    try {
      const data = await commit.run({
        file: { fileName: file.name, contentBase64: file.base64 },
      });
      const count = data?.commitTaskImport?.length ?? 0;
      setDone(count);
      onImported(count);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const checking = preview.loading;
  const committing = commit.loading;
  const canCommit =
    file !== null &&
    result !== null &&
    result.errorCount === 0 &&
    result.validCount > 0 &&
    !committing;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={template.loading}
            onClick={() => template.execute({ format: "CSV" })}
          >
            {t("templateCsv")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={template.loading}
            onClick={() => template.execute({ format: "XLSX" })}
          >
            {t("templateXlsx")}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="sr-only"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(null);
              setResult(null);
              void pickFile(picked);
              event.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            <FileUp data-icon="inline-start" />
            {file ? file.name : t("file")}
          </Button>
          <Button
            size="sm"
            disabled={!file || checking}
            onClick={() => void checkFile()}
          >
            {checking ? t("checking") : t("preview")}
          </Button>
        </div>

        {template.error ? (
          <InlineAlert tone="error">{errorText(template.error)}</InlineAlert>
        ) : null}
        {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
        {done !== null ? (
          <InlineAlert tone="success">{t("done", { count: done })}</InlineAlert>
        ) : null}

        {result ? (
          <div className="grid gap-2">
            <p className={cnText(result.errorCount)}>
              {t("summary", {
                valid: result.validCount,
                errors: result.errorCount,
              })}
            </p>
            <div className="max-h-80 overflow-y-auto border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">{t("colLine")}</TableHead>
                    <TableHead>{t("colTitle")}</TableHead>
                    <TableHead>{t("colAssignee")}</TableHead>
                    <TableHead>{t("colDates")}</TableHead>
                    <TableHead className="w-72">{t("colStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((row) => (
                    <TableRow key={row.line}>
                      <TableCell className="font-mono text-xs">
                        {row.line}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-sm">
                        {row.values.title || "—"}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-sm">
                        {row.values.assigneeEmail || "—"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {row.values.startDate}
                        {row.values.endDate ? ` → ${row.values.endDate}` : ""}
                      </TableCell>
                      <TableCell
                        className={
                          row.errors.length > 0
                            ? "text-xs text-destructive"
                            : "text-xs text-[#24a148]"
                        }
                      >
                        {row.errors.length > 0 ? row.errors.join(" ") : t("ok")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {result.errorCount > 0 ? (
              <p className="text-xs text-muted-foreground">{t("fixErrors")}</p>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {common("close")}
          </Button>
          <Button
            size="sm"
            disabled={!canCommit}
            onClick={() => void commitFile()}
          >
            {committing
              ? t("checking")
              : t("commit", { count: result?.validCount ?? 0 })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function cnText(errorCount: number): string {
  return `text-xs ${errorCount > 0 ? "text-destructive" : "text-[#24a148]"}`;
}
