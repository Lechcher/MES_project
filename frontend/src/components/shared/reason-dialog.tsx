"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorText } from "@/lib/mes/i18n/error-text";

export type ReasonDialogField = {
  name: string;
  label: string;
  type?: "text" | "datetime-local" | "date" | "number" | "textarea";
  placeholder?: string;
  required?: boolean;
  step?: string;
  defaultValue?: string;
};

/**
 * Dialog that collects one or more required values (for example a mandatory
 * cancel reason) and submits them as a record. Server failures are rendered
 * inline in the active locale (an API-supplied message passes through
 * untranslated).
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  confirmLabel,
  tone = "default",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: ReasonDialogField[];
  confirmLabel: string;
  tone?: "default" | "destructive";
  onSubmit: (values: Record<string, string>) => Promise<boolean>;
}) {
  const tCommon = useTranslations("common");
  const [values, setValues] = useState<Record<string, string>>({});
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const initial: Record<string, string> = {};
      for (const field of fields) {
        initial[field.name] = field.defaultValue ?? "";
      }
      setValues(initial);
      setError(null);
    }
    wasOpen.current = open;
  }, [open, fields]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const ok = await onSubmit(values);
      if (ok) {
        onOpenChange(false);
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3">
          {fields.map((field) => (
            <div key={field.name} className="grid gap-1">
              <Label htmlFor={`dialog-field-${field.name}`}>
                {field.label}
              </Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`dialog-field-${field.name}`}
                  value={values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  required={field.required}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              ) : (
                <Input
                  id={`dialog-field-${field.name}`}
                  type={field.type ?? "text"}
                  step={field.step}
                  value={values[field.name] ?? ""}
                  placeholder={field.placeholder}
                  required={field.required}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [field.name]: event.target.value,
                    }))
                  }
                />
              )}
            </div>
          ))}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              type="submit"
              variant={tone === "destructive" ? "destructive" : "default"}
              disabled={busy}
            >
              {busy ? tCommon("working") : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
