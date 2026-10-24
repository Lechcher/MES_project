"use client";

/**
 * Complete a password reset from the token in the link.
 *
 * Reachable without a session, so it lives outside the authenticated app shell.
 * An invalid or expired token is reported as such with a way to request a new
 * link, rather than as a generic failure — the difference decides whether the
 * visitor retries or gives up.
 *
 * The password is entered masked and is never written to browser storage.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import {
  isInvalidResetToken,
  MIN_PASSWORD_LENGTH,
  passwordPolicyError,
  RESET_PASSWORD,
} from "@/lib/mes/queries/auth";
import { useMutation } from "@/lib/mes/session";

/**
 * The reset page's card title.
 *
 * The title is rendered by a client component so it reads in the active
 * locale; the page shell itself stays server-rendered.
 */
export function ResetPasswordCardTitle() {
  const t = useTranslations("auth");
  return <CardTitle>{t("chooseNewPassword")}</CardTitle>;
}

/** The retry affordance shared by every unsatisfiable state. */
function RequestNewLink({ reason }: { reason: string }) {
  const t = useTranslations("auth");
  return (
    <div className="grid gap-4">
      <p role="alert" className="text-sm text-destructive">
        {reason}
      </p>
      <Link href="/signin" className={buttonVariants({ className: "w-full" })}>
        {t("requestNewLink")}
      </Link>
    </div>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const tErrors = useTranslations("errors");
  const errorText = useErrorText();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const reset = useMutation<{ resetPassword: boolean }>(RESET_PASSWORD);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // The rule stays in the pure helper so it is testable; the rendered
    // message follows the active locale.
    if (passwordPolicyError(password) !== null) {
      setError(tErrors("passwordPolicy", { count: MIN_PASSWORD_LENGTH }));
      return;
    }

    try {
      await reset.run({ input: { token, newPassword: password } });
      setPassword("");
      setDone(true);
    } catch {
      // The error is rendered from `reset.error` below.
    }
  };

  if (!token) {
    return <RequestNewLink reason={t("missingToken")} />;
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          {t("passwordChanged")}
        </p>
        <Link
          href="/signin"
          className={buttonVariants({ className: "w-full" })}
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  if (isInvalidResetToken(reset.error)) {
    return <RequestNewLink reason={t("invalidToken")} />;
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm text-muted-foreground">
        {t("newPasswordHint", { count: MIN_PASSWORD_LENGTH })}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="new-password">{t("newPassword")}</Label>
        <Input
          id="new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={error ? true : undefined}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {reset.error && !isInvalidResetToken(reset.error) ? (
        <p role="alert" className="text-sm text-destructive">
          {errorText(reset.error)}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={reset.loading}>
        {reset.loading ? t("saving") : t("setNewPassword")}
      </Button>
    </form>
  );
}
