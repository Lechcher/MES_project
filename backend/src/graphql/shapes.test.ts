/**
 * Shape mapping contracts.
 *
 * The mappings here are what the API hands to clients, so the tests pin the
 * values a client depends on. For `ExportResult` that dependency is the
 * download URL: it must be the frontend proxy path the browser can actually
 * open, never the backend's own bearer-authenticated route.
 */

import { describe, expect, test } from "bun:test";
import type { ExportArtifactRow } from "../db/schema";
import { toExportResult } from "./shapes";

function artifactRow(id: string): ExportArtifactRow {
	return {
		id,
		userId: null,
		fileName: "task-list-1234abcd.xlsx",
		mimeType:
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		format: "XLSX",
		storagePath: "/data/exports/task-list-1234abcd.xlsx",
		byteSize: 2048,
		createdAt: new Date("2026-10-31T00:00:00.000Z"),
	};
}

describe("toExportResult", () => {
	test("points the download URL at the frontend proxy path", () => {
		const result = toExportResult(artifactRow("artifact-1"));
		expect(result.url).toBe("/api/mes/exports/artifact-1");
	});

	test("never exposes the backend's own bearer-authenticated route", () => {
		const result = toExportResult(artifactRow("artifact-1"));
		expect(result.url.startsWith("/api/v1/")).toBe(false);
	});

	test("carries the remaining artifact fields through unchanged", () => {
		const row = artifactRow("artifact-2");
		const result = toExportResult(row);
		expect(result).toMatchObject({
			id: "artifact-2",
			fileName: row.fileName,
			mimeType: row.mimeType,
			format: "XLSX",
			createdAt: row.createdAt,
		});
	});
});
