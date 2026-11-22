"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/shared/query-states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import {
  CHANGE_PASSWORD,
  MIN_PASSWORD_LENGTH,
  passwordPolicyError,
  REQUEST_EMAIL_CHANGE,
} from "@/lib/mes/queries/auth";
import { useMutation, useViewer } from "@/lib/mes/session";

interface PasswordDraft {
  currentPassword: string;
  newPassword: string;
}

interface EmailDraft {
  currentPassword: string;
  newEmail: string;
}

const EMPTY_PASSWORD_DRAFT: PasswordDraft = {
  currentPassword: "",
  newPassword: "",
};

const EMPTY_EMAIL_DRAFT: EmailDraft = {
  currentPassword: "",
  newEmail: "",
};

/** Why the password form cannot submit yet, or `null` when it can. */
export function passwordSubmitBlock(
  draft: PasswordDraft,
): "empty" | "policy" | null {
  if (draft.currentPassword === "" || draft.newPassword === "") return "empty";
  if (passwordPolicyError(draft.newPassword) !== null) return "policy";
  return null;
}

/** Why the email form cannot submit yet, or `null` when it can. */
export function emailSubmitBlock(
  draft: EmailDraft,
  currentEmail: string,
): "empty" | "same" | null {
  const newEmail = draft.newEmail.trim().toLowerCase();
  if (draft.currentPassword === "" || newEmail === "") return "empty";
  if (newEmail === currentEmail.trim().toLowerCase()) return "same";
  return null;
}

/**
 * Account — a signed-in user's own credentials.
 *
 * Two self-service forms against the contract's auth operations: changing the
 * password (the server keeps this session and revokes the others) and starting
 * an email change (a verification link is mailed before the address moves).
 * Both fields are masked and nothing is written to browser storage.
 */
export function AccountPanel() {
  const t = useTranslations("settings.account");
  const tErrors = useTranslations("errors");
  const errorText = useErrorText();
  const viewer = useViewer();

  const changePassword = useMutation<unknown>(CHANGE_PASSWORD);
  const requestEmailChange = useMutation<unknown>(REQUEST_EMAIL_CHANGE);

  const [passwordDraft, setPasswordDraft] =
    useState<PasswordDraft>(EMPTY_PASSWORD_DRAFT);
  const [emailDraft, setEmailDraft] = useState<EmailDraft>(EMPTY_EMAIL_DRAFT);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);
  const [emailFeedback, setEmailFeedback] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);

  const passwordBlock = passwordSubmitBlock(passwordDraft);
  const emailBlock = viewer
    ? emailSubmitBlock(emailDraft, viewer.email)
    : "empty";

  const submitPassword = async () => {
    if (passwordBlock !== null) return;
    setPasswordFeedback(null);
    try {
      await changePassword.run({ input: passwordDraft });
      setPasswordDraft(EMPTY_PASSWORD_DRAFT);
      setPasswordFeedback({ tone: "success", message: t("passwordChanged") });
    } catch (cause) {
      setPasswordFeedback({ tone: "error", message: errorText(cause) });
    }
  };

  const submitEmail = async () => {
    if (emailBlock !== null) return;
    const newEmail = emailDraft.newEmail.trim().toLowerCase();
    setEmailFeedback(null);
    try {
      await requestEmailChange.run({
        input: {
          currentPassword: emailDraft.currentPassword,
          newEmail,
        },
      });
      setEmailDraft(EMPTY_EMAIL_DRAFT);
      setEmailFeedback({
        tone: "success",
        message: t("emailVerificationSent", { email: newEmail }),
      });
    } catch (cause) {
      setEmailFeedback({ tone: "error", message: errorText(cause) });
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div>
        <h2 className="text-sm font-semibold">{t("title")}</h2>
        <p className="text-xs text-muted-foreground">{t("description")}</p>
      </div>

      {viewer ? (
        <section className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium">{t("passwordTitle")}</h3>
            <p className="text-xs text-muted-foreground">
              {t("passwordDescription")}
            </p>
          </div>

          {passwordFeedback ? (
            <InlineAlert tone={passwordFeedback.tone}>
              {passwordFeedback.message}
            </InlineAlert>
          ) : null}

          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label htmlFor="account-current-password">
                {t("passwordCurrent")}
              </Label>
              <Input
                id="account-current-password"
                type="password"
                autoComplete="current-password"
                value={passwordDraft.currentPassword}
                onChange={(event) =>
                  setPasswordDraft((current) => ({
                    ...current,
                    currentPassword: event.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="account-new-password">{t("passwordNew")}</Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                value={passwordDraft.newPassword}
                onChange={(event) =>
                  setPasswordDraft((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {tErrors("passwordPolicy", { count: MIN_PASSWORD_LENGTH })}
            </p>
          </div>

          <div>
            <Button
              onClick={submitPassword}
              disabled={changePassword.loading || passwordBlock !== null}
            >
              {changePassword.loading ? t("passwordSaving") : t("passwordSave")}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-medium">{t("emailTitle")}</h3>
          <p className="text-xs text-muted-foreground">
            {t("emailDescription")}
          </p>
        </div>

        {viewer ? (
          <p className="text-xs text-muted-foreground">
            {t("emailCurrent", { email: viewer.email })}
          </p>
        ) : null}

        {emailFeedback ? (
          <InlineAlert tone={emailFeedback.tone}>
            {emailFeedback.message}
          </InlineAlert>
        ) : null}

        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label htmlFor="account-email-current-password">
              {t("emailCurrentPassword")}
            </Label>
            <Input
              id="account-email-current-password"
              type="password"
              autoComplete="current-password"
              value={emailDraft.currentPassword}
              onChange={(event) =>
                setEmailDraft((current) => ({
                  ...current,
                  currentPassword: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="account-new-email">{t("emailNew")}</Label>
            <Input
              id="account-new-email"
              type="email"
              autoComplete="email"
              value={emailDraft.newEmail}
              onChange={(event) =>
                setEmailDraft((current) => ({
                  ...current,
                  newEmail: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <div>
          <Button
            onClick={submitEmail}
            disabled={requestEmailChange.loading || emailBlock !== null}
          >
            {requestEmailChange.loading ? t("emailSaving") : t("emailSave")}
          </Button>
        </div>
      </section>
    </div>
  );
}
