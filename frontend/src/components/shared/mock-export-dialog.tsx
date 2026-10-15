"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ExportFormat } from "@/lib/mock/types";

type MockExportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileName: string;
  format: ExportFormat;
  mimeType: string;
  scope?: string;
  onClose?: () => void;
};

export function MockExportDialog({
  open,
  onOpenChange,
  fileName,
  format,
  mimeType,
  scope,
  onClose,
}: MockExportDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md shadow-none border border-border">
        <DialogHeader>
          <DialogTitle>Print / Export result</DialogTitle>
          <DialogDescription>
            {`${fileName} &middot; ${format} &middot; ${mimeType}${scope ? ` &middot; ${scope}` : ""}`}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          Mock result — no file generated and no network call. Print/export in
          this prototype returns a descriptor only.
        </p>
        <div className="flex justify-end">
          <Button
            onClick={() => {
              onOpenChange(false);
              onClose?.();
            }}
            variant="outline"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
