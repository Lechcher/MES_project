"use client";

import {
  Download,
  FileArchive,
  File as FileIcon,
  FileJson,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMesFormat } from "@/lib/mes/i18n/format";
import type { Attachment } from "@/lib/mes/queries/types";

/** What a previewable attachment renders as, derived from its MIME type. */
export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "file";

/**
 * Derive the preview kind from a MIME type.
 *
 * Anything the browser cannot render itself is a file card — including the
 * Office formats, which are download-only (nothing converts them server-side).
 */
export function attachmentKind(mimeType: string | null): AttachmentKind {
  if (!mimeType) return "file";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  return "file";
}

/** The lucide icon a non-previewable file shows, by its extension. */
function fileIconFor(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "xlsx":
    case "xls":
    case "csv":
    case "ods":
      return FileSpreadsheet;
    case "zip":
    case "gz":
    case "tar":
    case "7z":
    case "rar":
      return FileArchive;
    case "json":
      return FileJson;
    case "txt":
    case "md":
    case "log":
    case "tsv":
      return FileText;
    default:
      return FileIcon;
  }
}

/** Same-origin path for a stored object key. */
function filePath(key: string): string {
  return `/api/mes/files/${key}`;
}

function downloadHref(attachment: Attachment): string {
  return `${filePath(attachment.url)}?download=1`;
}

/**
 * Attachment preview and download.
 *
 * Images, video, audio and PDF open inline in a dialog; every other format is a
 * file card with its icon, name, size and a download action. Every URL is a
 * same-origin `/api/mes/files/...` path, so the session check applies to
 * previews as much as to downloads.
 */
export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const t = useTranslations("jobs.attachments");
  const fmt = useMesFormat();
  const [open, setOpen] = useState(false);

  const name = attachment.fileName ?? attachment.url.split("/").pop() ?? "";
  const kind = attachmentKind(attachment.mimeType);
  const size =
    attachment.sizeBytes === null ? null : fmt.bytes(attachment.sizeBytes);
  const href = filePath(attachment.url);
  const Icon = fileIconFor(name);

  const card = (
    <span className="flex min-w-0 items-center gap-2 border border-border px-2 py-1 text-xs">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{name}</span>
      {size ? (
        <span className="shrink-0 text-muted-foreground">{size}</span>
      ) : null}
      <Button
        size="xs"
        variant="outline"
        nativeButton={false}
        render={<a href={downloadHref(attachment)} download={name} />}
      >
        <Download aria-hidden />
        {t("download")}
      </Button>
    </span>
  );

  if (kind === "file") return card;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-2 border border-border px-2 py-1 text-xs hover:border-primary"
      >
        {kind === "image" ? (
          // The image itself is the affordance; a missing file degrades to its
          // alt text rather than a broken layout. A plain `<img>` is correct
          // here: the route is authenticated, so `next/image` cannot fetch it,
          // and these are user-supplied ticket files, not static assets.
          // biome-ignore lint/performance/noImgElement: the authenticated route serves user files, which `next/image` cannot optimize.
          <img src={href} alt={name} className="h-8 w-8 object-cover" />
        ) : null}
        <span className="truncate">{name}</span>
        {size ? (
          <span className="shrink-0 text-muted-foreground">{size}</span>
        ) : null}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {kind === "image" ? (
              // biome-ignore lint/performance/noImgElement: same as above.
              <img src={href} alt={name} className="max-h-[70vh] w-auto" />
            ) : null}
            {kind === "video" ? (
              // biome-ignore lint/a11y/useMediaCaption: these are the ticket's own evidence files, which carry no caption track to reference.
              <video
                src={href}
                controls
                preload="metadata"
                className="max-h-[70vh] w-auto"
              />
            ) : null}
            {kind === "audio" ? (
              // biome-ignore lint/a11y/useMediaCaption: the ticket's own audio evidence carries no caption track.
              <audio src={href} controls className="w-full" />
            ) : null}
            {kind === "pdf" ? (
              <iframe
                src={href}
                title={name}
                className="h-[70vh] w-full border-0"
              />
            ) : null}
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<a href={downloadHref(attachment)} download={name} />}
            >
              <Download aria-hidden />
              {t("download")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Render a list of attachments, one per row.
 *
 * Used by the ticket attachment section and by every journey entry, whose
 * evidence and required-fix files are passed as two separate lists.
 */
export function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const t = useTranslations("jobs.attachments");
  if (attachments.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("none")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <AttachmentPreview attachment={attachment} />
        </li>
      ))}
    </ul>
  );
}
