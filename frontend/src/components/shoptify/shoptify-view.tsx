"use client";

import { useTranslations } from "next-intl";
import { StoresPanel } from "./stores-panel";

/**
 * Shopify commerce app shell.
 *
 * The overview lands on the stores panel — the connection state is the
 * module's home screen; the other sections are linked from the top
 * navigation like the platform's other apps.
 */
export function ShoptifyView() {
  const t = useTranslations("shoptify");
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("eyebrow")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <StoresPanel />
    </div>
  );
}
