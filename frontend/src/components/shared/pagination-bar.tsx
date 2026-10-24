"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { OffsetPageInfo } from "@/lib/mes/queries/types";

/** Offset pagination bar driven by the API's `OffsetPageInfo`. */
export function PaginationBar({
  pageInfo,
  onOffsetChange,
  limit,
  className,
}: {
  pageInfo: OffsetPageInfo;
  onOffsetChange: (offset: number) => void;
  limit: number;
  className?: string;
}) {
  const t = useTranslations("common.pagination");
  const from = pageInfo.totalCount === 0 ? 0 : pageInfo.offset + 1;
  const to = Math.min(pageInfo.offset + limit, pageInfo.totalCount);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("summary", { from, to, total: pageInfo.totalCount })}
        </p>
        <Pagination className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text={t("previous")}
                aria-disabled={pageInfo.offset <= 0}
                onClick={(event) => {
                  event.preventDefault();
                  if (pageInfo.offset > 0) {
                    onOffsetChange(Math.max(pageInfo.offset - limit, 0));
                  }
                }}
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink
                size="default"
                isActive
                href="#"
                onClick={(event) => event.preventDefault()}
              >
                {Math.floor(pageInfo.offset / limit) + 1}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                text={t("next")}
                aria-disabled={!pageInfo.hasNextPage}
                onClick={(event) => {
                  event.preventDefault();
                  if (pageInfo.hasNextPage) {
                    onOffsetChange(pageInfo.offset + limit);
                  }
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

/** Section wrapper with an eyebrow label and an optional trailing action. */
export function SectionHeader({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
      {action}
    </div>
  );
}
