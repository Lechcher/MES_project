"use client";

/**
 * Request a password-reset message.
 *
 * The outcome is deliberately neutral: the screen never reveals whether the
 * address has an account. A request that could not be *delivered* is a different
 * matter and is reported explicitly, because telling the visitor their message is
 * on its way when it is not would leave them waiting for something that will
 * never arrive.
 */

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { REQUEST_PASSWORD_RESET } from "@/lib/mes/queries/auth";
import { useMutation } from "@/lib/mes/session";

interface RequestResetFormProps {
  /** Invoked when the visitor dismisses the form. */
  onCancel?: () => void;
}

export function RequestResetForm({ onCancel }: RequestResetFormProps) {
  const t = useTranslations("auth");
  const errorText = useErrorText();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const request = useMutation<{ requestPasswordReset: boolean }>(
    REQUEST_PASSWORD_RESET,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await request.run({ email });
      setRequested(true);
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  if (requested) {
    return (
      <div className="grid gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          {t.rich("requestedStatus", {
            email,
            // The address is user data; bold it without translating it.
            strong: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("backToSignIn")}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm text-muted-foreground">{t("resetIntro")}</p>
      <div className="grid gap-1.5">
        <Label htmlFor="reset-email">{t("email")}</Label>
        <Input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("emailPlaceholder")}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={request.loading}>
        {request.loading ? t("sending") : t("sendResetLink")}
      </Button>
      {onCancel ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("backToSignIn")}
        </Button>
      ) : null}
    </form>
  );
}
