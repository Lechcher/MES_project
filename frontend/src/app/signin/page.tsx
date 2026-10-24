"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { RequestResetForm } from "@/components/auth/request-reset-form";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useErrorText } from "@/lib/mes/i18n/error-text";
import { useMesSession } from "@/lib/mes/session";

export default function SignInPage() {
  const t = useTranslations("auth");
  const { signIn } = useMesSession();
  const errorText = useErrorText();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"signin" | "request">("signin");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="grid gap-1.5">
              <CardTitle>
                {mode === "signin" ? t("signInTitle") : t("resetTitle")}
              </CardTitle>
              {mode === "signin" ? (
                <p className="text-sm text-muted-foreground">
                  {t("signInHint")}
                </p>
              ) : null}
            </div>
            <LanguageSwitcher id="signin-language" />
          </div>
        </CardHeader>
        <CardContent>
          {mode === "signin" ? (
            <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="email">{t("email")}</Label>
                <Input
                  id="email"
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
              <div className="grid gap-1.5">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
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
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("signingIn") : t("signIn")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setMode("request")}
              >
                {t("forgotPassword")}
              </Button>
            </form>
          ) : (
            <RequestResetForm onCancel={() => setMode("signin")} />
          )}
        </CardContent>
        <CardFooter className="justify-center text-center text-xs text-muted-foreground">
          {/* Development-only hint. The production UI never offers demo
					    accounts or credentials. */}
          {process.env.NODE_ENV !== "production" ? (
            <span>{t("devFooter")}</span>
          ) : (
            <span>{t("contactAdmin")}</span>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
