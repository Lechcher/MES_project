/**
 * services/shared.ts — shared plumbing for the mock service layer.
 *
 * - Pagination: slices a node array into a contract-shaped `Connection<T>`
 *   honoring offset/limit, with `pageInfo` (`offset`, `limit`, `totalCount`,
 *   `hasNextPage`).
 * - Mock export result: the shared descriptor returned by every print/export
 *   action — no real file, no network (design decision D9).
 */

import type {
  Connection,
  ExportFormat,
  ExportResult,
  OffsetPageInfo,
} from "../types";

/*──────────────────────────── pagination ─────────────────────────────────────*/

export function paginate<T>(nodes: T[], offset = 0, limit = 20): Connection<T> {
  const totalCount = nodes.length;
  const from = Math.max(offset, 0);
  const page = nodes.slice(from, from + Math.max(limit, 1));
  return {
    nodes: page,
    pageInfo: {
      offset: from,
      limit,
      totalCount,
      hasNextPage: from + page.length < totalCount,
    },
  };
}

export function makePageInfo(
  offset: number,
  limit: number,
  totalCount: number,
): OffsetPageInfo {
  return {
    offset,
    limit,
    totalCount,
    hasNextPage: offset + limit < totalCount,
  };
}

/*──────────────────────────── mock export result ─────────────────────────────*/

export function mockExportResult(
  fileName: string,
  mimeType: string,
  format: ExportFormat,
): ExportResult {
  return {
    id: `mock-export-${Date.now()}`,
    fileName,
    mimeType,
    format,
    url: `mock://exports/${fileName}`,
    createdAt: new Date().toISOString(),
  };
}

export const MOCK_EXPORT_NOTE =
  "Mock result — no file generated, no network call. Print/export in this prototype returns a descriptor only.";
