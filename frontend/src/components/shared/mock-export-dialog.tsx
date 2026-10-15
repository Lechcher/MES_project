"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MockExportDescriptor } from "@/lib/mock/services/shared";

/**
 * One shared mock print/export result dialog. Every Print/Export button opens
 * this — it shows the would-be artifact and states plainly that no real file is
 * generated and no network request is made.
 */
export function MockExportDialog({
  result,
  open,
  onOpenChange,
}: {
  result: MockExportDescriptor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mock {result?.format ?? ""} result</DialogTitle>
          <DialogDescription>
            mock — no file generated. This prototype makes no network requests.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Document</dt>
            <dd className="font-mono break-all">{result.fileName}</dd>
            <dt className="text-muted-foreground">Format</dt>
            <dd>{result.format}</dd>
            <dt className="text-muted-foreground">MIME type</dt>
            <dd className="break-all">{result.mimeType}</dd>
            <dt className="text-muted-foreground">Scope</dt>
            <dd>{result.scopeNote}</dd>
          </dl>
        ) : null}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
