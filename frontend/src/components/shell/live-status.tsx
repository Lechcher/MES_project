"use client";

/**
 * Live connection status indicator.
 *
 * Shows whether the change-event channel is live, connecting, or offline, in
 * the DESIGN.md semantic colors. Offline keeps the last-known data on screen
 * with manual refresh available, so the label says exactly that.
 */

import { LoaderCircle, Radio, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { type LiveStatus, useLiveStatus } from "@/lib/mes/live";

const SEMANTIC_COLORS = {
  success: "#24a148",
  warning: "#f1c21b",
  error: "#da1e28",
} as const;

const STATUS_COLORS: Record<LiveStatus, string> = {
  live: SEMANTIC_COLORS.success,
  connecting: SEMANTIC_COLORS.warning,
  offline: SEMANTIC_COLORS.error,
};

const LABEL_KEYS = {
  live: "live.live",
  connecting: "live.connecting",
  offline: "live.offline",
} as const;

const TITLE_KEYS = {
  live: "live.liveTitle",
  connecting: "live.connectingTitle",
  offline: "live.offlineTitle",
} as const;

const ICONS = {
  live: Radio,
  connecting: LoaderCircle,
  offline: WifiOff,
} as const;

export function LiveStatusIndicator() {
  const status = useLiveStatus();
  const t = useTranslations("shell");
  const label = t(LABEL_KEYS[status]);
  const title = t(TITLE_KEYS[status]);
  const color = STATUS_COLORS[status];
  const Icon = ICONS[status];

  return (
    <span
      title={title}
      data-status={status}
      className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium"
      style={{ color }}
    >
      <Icon
        className={`size-3.5 ${status === "connecting" ? "animate-spin" : ""}`}
        aria-hidden
      />
      <span aria-hidden className="hidden sm:inline">
        {label}
      </span>
      <span className="sr-only">{t("live.srSummary", { label, title })}</span>
    </span>
  );
}
