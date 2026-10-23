"use client";

import { Paperclip, Trash2, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { InlineAlert } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes, useMesFormat } from "@/lib/mes/i18n/format";

/** One record the file route reported after storing a file. */
export interface StoredAttachment {
  id: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

interface UploadFailure {
  fileName: string;
  code: string;
  message: string;
}

/** A file the employee picked and its upload state. */
interface PendingFile {
  key: string;
  file: File;
  status: "pending" | "uploading" | "stored" | "failed";
  /** Present once the file has been stored. */
  stored?: StoredAttachment;
  /** Present when the file or the route refused it. */
  failure?: UploadFailure;
}

const MAX_FILES_PER_REQUEST = 20;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Multi-select attachment input with drag & drop.
 *
 * Mixed formats may be picked in one selection; each file shows its size and
 * format, can be removed before submitting, and reports its own outcome. The
 * whole selection is posted to `/api/mes/files` in one request, and the ids of
 * the stored files are what the caller submits with the completion request.
 */
export function AttachmentField({
  taskId,
  attachmentIds,
  onChange,
  disabled = false,
}: {
  taskId: string;
  attachmentIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("jobs.attachments");
  const fmt = useMesFormat();
  const inputId = useId();
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = (files: File[]) => {
    const remaining = Math.max(0, MAX_FILES_PER_REQUEST - attachmentIds.length);
    if (files.length > remaining) {
      setError(t("tooManyFiles", { limit: MAX_FILES_PER_REQUEST }));
    }
    setPending((current) => [
      ...current,
      ...files.slice(0, remaining).map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}-${current.length}`,
        file,
        status: "pending" as const,
      })),
    ]);
  };

  const remove = (key: string) => {
    setPending((current) => current.filter((entry) => entry.key !== key));
  };

  const upload = async () => {
    const queue = pending.filter((entry) => entry.status === "pending");
    if (queue.length === 0) return;

    setError(null);
    setUploading(true);
    setPending((current) =>
      current.map((entry) =>
        entry.status === "pending" ? { ...entry, status: "uploading" } : entry,
      ),
    );

    const form = new FormData();
    form.set("taskId", taskId);
    for (const entry of queue) form.append("files", entry.file);

    try {
      const response = await fetch("/api/mes/files", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as {
        files?: StoredAttachment[];
        failures?: UploadFailure[];
        error?: string;
      };

      if (!response.ok || !body.files) {
        setError(body.error ?? t("uploadFailed"));
        setPending((current) =>
          current.map((entry) =>
            entry.status === "uploading"
              ? {
                  ...entry,
                  status: "failed",
                  failure: {
                    fileName: entry.file.name,
                    code: "REQUEST_FAILED",
                    message: body.error ?? t("uploadFailed"),
                  },
                }
              : entry,
          ),
        );
        return;
      }

      const stored = new Map(
        (body.files ?? []).map((record) => [record.fileName, record]),
      );
      setPending((current) =>
        current.map((entry) => {
          if (entry.status !== "uploading") return entry;
          const record = stored.get(entry.file.name);
          if (!record) {
            const failure = (body.failures ?? []).find(
              (item) => item.fileName === entry.file.name,
            );
            return {
              ...entry,
              status: "failed",
              failure: failure ?? {
                fileName: entry.file.name,
                code: "UNKNOWN",
                message: t("uploadFailed"),
              },
            };
          }
          return { ...entry, status: "stored", stored: record };
        }),
      );
      onChange([...attachmentIds, ...(body.files ?? []).map((r) => r.id)]);
    } catch {
      setError(t("uploadFailed"));
      setPending((current) =>
        current.map((entry) =>
          entry.status === "uploading"
            ? {
                ...entry,
                status: "failed",
                failure: {
                  fileName: entry.file.name,
                  code: "NETWORK",
                  message: t("uploadFailed"),
                },
              }
            : entry,
        ),
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{t("label")}</Label>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the drop target is the
      visible affordance; the accessible file input below reaches the same
      picker. */}
      <div
        className={`flex flex-col items-center gap-1 border border-dashed border-border p-4 text-center text-xs text-muted-foreground ${
          dragging ? "border-primary bg-primary/5" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <Upload className="size-4" aria-hidden />
        <p>{t("dropHint", { limit: MAX_FILES_PER_REQUEST })}</p>
        <Input
          id={inputId}
          type="file"
          multiple
          className="max-w-sm"
          disabled={disabled || uploading}
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
      {pending.length > 0 ? (
        <ul className="flex flex-col gap-1 text-xs">
          {pending.map((entry) => (
            <li
              key={entry.key}
              className="flex items-center justify-between gap-2 border border-border px-2 py-1"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{entry.file.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {formatBytes(
                    entry.file.size,
                    fmt.decimal(1).includes(",") ? "," : ".",
                  )}
                </span>
                <span className="shrink-0 uppercase text-muted-foreground">
                  {extensionOf(entry.file.name) || t("unknownFormat")}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {entry.status === "uploading" ? (
                  <span className="text-muted-foreground">
                    {t("uploading")}
                  </span>
                ) : null}
                {entry.status === "stored" ? (
                  <span className="text-[#24a148]">{t("stored")}</span>
                ) : null}
                {entry.failure ? (
                  <span className="text-destructive">
                    {entry.failure.message}
                  </span>
                ) : null}
                {entry.status === "pending" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => remove(entry.key)}
                  >
                    <Trash2 aria-hidden />
                    {t("remove")}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || uploading || pending.length === 0}
          onClick={upload}
        >
          {uploading ? t("uploading") : t("upload")}
        </Button>
        {attachmentIds.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            {t("attached", { count: attachmentIds.length })}
          </span>
        ) : null}
      </div>
      {error ? <InlineAlert tone="error">{error}</InlineAlert> : null}
    </div>
  );
}
