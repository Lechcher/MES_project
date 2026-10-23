/**
 * Audit Log app resolvers (`API_CONTACT_SPECIFICATION.md` §6.5).
 *
 * Read-only over the append-only audit store, plus a filtered export that
 * produces a real `.xlsx`/`.csv` artifact without touching the trail. Access is
 * limited to Super Admin and Tech Lead by `access.ts`.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { Auth } from "../../auth";
import type { SystemAuditLogRow } from "../../db/schema";
import { exportArtifacts } from "../../db/schema";
import {
	listAuditLogs,
	type ModuleAuditFilterInput,
	moduleActivity,
} from "../../domain/audit-log";
import { authorize } from "../access";
import type { ViewerContext } from "../context";
import { DomainError } from "../errors";
import { pagination, toExportResult, toSystemAuditLog } from "../shapes";

type Resolver = (
	parent: unknown,
	args: any,
	contextValue: { ctx: ViewerContext; auth: Auth },
	info: unknown,
) => unknown;

/** The assembled schema declares the resolver context as `unknown`. */
type AssembledResolver = (
	parent: unknown,
	args: any,
	contextValue: unknown,
	info: unknown,
) => unknown;

const XLSX_MIME =
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const CSV_MIME = "text/csv";

function jsonText(value: string | null): string {
	if (value === null) return "";
	return value;
}

function isoOf(value: Date | null): string {
	return value ? value.toISOString() : "";
}

function buildWorkbook(rows: SystemAuditLogRow[]): ExcelJS.Workbook {
	const workbook = new ExcelJS.Workbook();
	workbook.created = new Date();
	const sheet = workbook.addWorksheet("Audit Logs");
	sheet.columns = [
		{ header: "ID", key: "id", width: 38 },
		{ header: "Created At (UTC)", key: "createdAt", width: 24 },
		{ header: "User ID", key: "userId", width: 38 },
		{ header: "Module", key: "moduleCode", width: 14 },
		{ header: "Action", key: "action", width: 24 },
		{ header: "Resource Type", key: "resourceType", width: 20 },
		{ header: "Resource ID", key: "resourceId", width: 38 },
		{ header: "IP Address", key: "ipAddress", width: 18 },
		{ header: "User Agent", key: "userAgent", width: 30 },
		{ header: "Old Data", key: "oldData", width: 40 },
		{ header: "New Data", key: "newData", width: 40 },
	];
	for (const row of rows) {
		sheet.addRow({
			id: row.id,
			createdAt: isoOf(row.createdAt),
			userId: row.userId ?? "",
			moduleCode: row.moduleCode ?? "",
			action: row.action,
			resourceType: row.resourceType,
			resourceId: row.resourceId ?? "",
			ipAddress: row.ipAddress ?? "",
			userAgent: row.userAgent ?? "",
			oldData: jsonText(row.oldData),
			newData: jsonText(row.newData),
		});
	}
	return workbook;
}

const queryResolvers: Record<string, Resolver> = {
	auditLogs: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "auditLogs");
		const offset = args.offset ?? 0;
		const limit = args.limit ?? 20;
		const page = await listAuditLogs(ctx, {
			filter: (args.filter ?? null) as ModuleAuditFilterInput | null,
			offset,
			limit,
		});
		return {
			nodes: page.nodes.map(toSystemAuditLog),
			pageInfo: pagination(offset, limit, page.totalCount),
		};
	},

	moduleActivity: async (_parent, args: any, { ctx }) => {
		authorize(ctx, "moduleActivity");
		return moduleActivity(
			ctx,
			(args.filter ?? null) as ModuleAuditFilterInput | null,
		);
	},
};

const mutationResolvers: Record<string, Resolver> = {
	exportAuditLogs: async (
		_parent,
		args: { filter?: ModuleAuditFilterInput | null; format?: string },
		{ ctx },
	) => {
		authorize(ctx, "exportAuditLogs");

		const format = args.format ?? "XLSX";
		if (format !== "XLSX" && format !== "CSV") {
			throw new DomainError(
				"VALIDATION_FAILED",
				"Audit log export supports XLSX or CSV.",
			);
		}

		const filter = args.filter ?? null;
		const probe = await listAuditLogs(ctx, { filter, offset: 0, limit: 1 });
		const page = await listAuditLogs(ctx, {
			filter,
			offset: 0,
			limit: Math.max(probe.totalCount, 1),
		});

		const workbook = buildWorkbook(page.nodes);
		const extension = format === "CSV" ? "csv" : "xlsx";
		const mimeType = format === "CSV" ? CSV_MIME : XLSX_MIME;
		const fileName = `audit-logs-${Date.now()}.${extension}`;
		const storagePath = join(ctx.config.exportDir, fileName);

		const raw =
			format === "CSV"
				? await workbook.csv.writeBuffer()
				: await workbook.xlsx.writeBuffer();
		const bytes = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);

		await mkdir(ctx.config.exportDir, { recursive: true });
		await writeFile(storagePath, new Uint8Array(bytes));

		const id = crypto.randomUUID();
		await ctx.db.insert(exportArtifacts).values({
			id,
			userId: ctx.viewer?.id ?? null,
			fileName,
			mimeType,
			format,
			storagePath,
			byteSize: bytes.length,
		});

		const [artifact] = await ctx.db
			.select()
			.from(exportArtifacts)
			.where(eq(exportArtifacts.id, id))
			.limit(1);

		if (!artifact) {
			throw new DomainError(
				"INTERNAL",
				"The audit export artifact could not be recorded.",
			);
		}
		return toExportResult(artifact);
	},
};

export const auditLogQuery = queryResolvers as Record<
	string,
	AssembledResolver
>;
export const auditLogMutation = mutationResolvers as Record<
	string,
	AssembledResolver
>;
