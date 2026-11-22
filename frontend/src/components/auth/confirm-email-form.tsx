"use client";

/**
 * Confirm an email change from the token in the link.
 *
 * Reachable without a session, so it lives outside the authenticated app shell
 * like the reset route: the token is what binds the change to the account that
 * requested it, so no sign-in is asked for. An invalid or expired link is
 * reported as such with a way back, rather than as a generic failure.
 */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import {
  CONFIRM_EMAIL_CHANGE,
  isInvalidResetToken,
} from "@/lib/mes/queries/auth";
import { useMesSession, useMutation } from "@/lib/mes/session";

/**
 * Finish a confirmed change.
 *
 * The viewer is refreshed so a signed-in visitor who opens the link in another
 * tab and comes back sees the new address in the shell and on the Account tab,
 * rather than the address the change replaced.
 */
export async function completeConfirmation(
  setDone: (done: boolean) => void,
  refresh: () => Promise<unknown>,
): Promise<void> {
  setDone(true);
  await refresh();
}

/**
 * The confirmation page's card title.
 *
 * The title is rendered by a client component so it reads in the active
 * locale; the page shell itself stays server-rendered.
 */
export function ConfirmEmailCardTitle() {
  const t = useTranslations("auth");
  return <CardTitle>{t("confirmEmailTitle")}</CardTitle>;
}

/** The retry affordance shared by every unsatisfiable state. */
function BackToAccount({ reason }: { reason: string }) {
  const t = useTranslations("auth");
  return (
    <div className="grid gap-4">
      <p role="alert" className="text-sm text-destructive">
        {reason}
      </p>
      <Link
        href="/settings"
        className={buttonVariants({ className: "w-full" })}
      >
        {t("backToAccount")}
      </Link>
    </div>
  );
}

export function ConfirmEmailForm() {
  const t = useTranslations("auth");
  const errorText = useErrorText();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { refresh } = useMesSession();

  const [done, setDone] = useState(false);
  const confirm = useMutation<{ confirmEmailChange: boolean }>(
    CONFIRM_EMAIL_CHANGE,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await confirm.run({ token });
      await completeConfirmation(setDone, refresh);
    } catch {
      // The error is rendered from `confirm.error` below.
    }
  };

  if (!token) {
    return <BackToAccount reason={t("missingConfirmationToken")} />;
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <p role="status" className="text-sm text-muted-foreground">
          {t("emailChangeConfirmed")}
        </p>
        <Link
          href="/settings"
          className={buttonVariants({ className: "w-full" })}
        >
          {t("backToAccount")}
        </Link>
      </div>
    );
  }

  if (isInvalidResetToken(confirm.error)) {
    return <BackToAccount reason={t("invalidConfirmationToken")} />;
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
      <p className="text-sm text-muted-foreground">{t("confirmEmailIntro")}</p>
      {confirm.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorText(confirm.error)}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={confirm.loading}>
        {confirm.loading ? t("confirming") : t("confirmEmailSubmit")}
      </Button>
    </form>
  );
}
