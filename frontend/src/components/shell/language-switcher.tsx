"use client";

/**
 * Language switcher.
 *
 * Built from the shared shadcn/Base UI `Select` primitive. Each language is
 * named in itself ("English", "Tiếng Việt") in every locale, so the labels
 * are proper names rather than catalogue messages. Choosing one applies the
 * locale to the running interface without a reload and remembers it in the
 * `mes_locale` cookie.
 */

import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MES_LOCALES, type MesLocale } from "@/lib/mes/i18n/config";
import { useLocaleChoice } from "@/lib/mes/i18n/provider";

/** Each language's own name, identical in every locale. */
const LANGUAGE_NAMES: Record<MesLocale, string> = {
  en: "English",
  vi: "Tiếng Việt",
};

export function LanguageSwitcher({
  id = "language-switcher",
}: {
  id?: string;
}) {
  const { locale, setLocale } = useLocaleChoice();

  return (
    <Select
      value={locale}
      onValueChange={(value) => {
        if (value === "en" || value === "vi") {
          setLocale(value);
        }
      }}
      items={Object.fromEntries(
        MES_LOCALES.map((code) => [code, LANGUAGE_NAMES[code]]),
      )}
    >
      <SelectTrigger id={id} size="sm" aria-label="Language">
        <Languages className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MES_LOCALES.map((code) => (
          <SelectItem key={code} value={code}>
            {LANGUAGE_NAMES[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
