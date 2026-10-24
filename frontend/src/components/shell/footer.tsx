"use client";

import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("shell");
  return (
    <footer className="mt-auto border-t border-border bg-foreground py-6 text-background">
      <div className="flex flex-col items-center gap-1 px-4">
        {/* Brand names stay verbatim in every locale by design. */}
        <p className="text-sm font-medium">MES Prototype</p>
        <p className="text-xs text-[#c6c6c6]">{t("footer.tagline")}</p>
      </div>
    </footer>
  );
}
