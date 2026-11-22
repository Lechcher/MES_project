"use client";

/**
 * Theme switcher.
 *
 * Built from the shared shadcn/Base UI `Select` primitive, exactly as the
 * language switcher is, so the shell carries two same-shaped preference
 * controls. Mode names come from the localized `shell.theme` catalogue rather
 * than being proper nouns — "Follow system" and its partner labels read in the
 * active locale under `en` and `vi`, so the selector's accessible name is
 * localized too.
 *
 * The trigger shows the icon of the mode that is *currently in effect*
 * (resolved against the operating system, not merely the stored mode), so a
 * viewer on follow-the-system on a dark system sees the moon even though
 * nothing was pinned.
 */

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ThemeMode } from "@/lib/mes/theme/config";
import { useThemeChoice } from "@/lib/mes/theme/provider";

/** The icon each mode shows; follow-the-system shows what it resolved to. */
function modeIcon(mode: ThemeMode, theme: "light" | "dark") {
  if (mode === "light") return Sun;
  if (mode === "dark") return Moon;
  return theme === "dark" ? Moon : Sun;
}

export function ThemeSwitcher({ id = "theme-switcher" }: { id?: string }) {
  const { mode, theme, setTheme } = useThemeChoice();
  const t = useTranslations("shell.theme");

  const ModeIcon = modeIcon(mode, theme);
  const modeName: Record<ThemeMode, string> = {
    system: t("system"),
    light: t("light"),
    dark: t("dark"),
  };

  return (
    <Select
      value={mode}
      onValueChange={(value) => {
        if (value === "system" || value === "light" || value === "dark") {
          setTheme(value);
        }
      }}
      items={Object.fromEntries(
        (["system", "light", "dark"] as const).map((code) => [
          code,
          modeName[code],
        ]),
      )}
    >
      <SelectTrigger id={id} size="sm" aria-label={t("switchTheme")}>
        <ModeIcon className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(
          [
            ["system", modeName.system],
            ["light", modeName.light],
            ["dark", modeName.dark],
          ] as const
        ).map(([code, label]) => (
          <SelectItem key={code} value={code}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
