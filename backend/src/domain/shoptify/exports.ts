/**
 * Shopify commerce exports.
 *
 * Produces the same artifact shape as the platform's report engine
 * (`backend/src/reports/exports.ts`): a real file under `config.exportDir`, a
 * matching `export_artifacts` row, and the existing download route serves it.
 * Only the listing-shaped reports this module ships (orders, products) exist;
 * the heavy layouts stay with the platform engine.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import type { AppConfig } from "../../config";
import { exportArtifacts } from "../../db/schema";
import type { ViewerContext } from "../../graphql/context";
import { DomainError } from "../../graphql/errors";
import { listProducts, type ProductFilter } from "./catalog";
import { listOrders, type OrderFilter } from "./orders";
import { toMinorUnits } from "./shapes";

export type ShoptifyExportFormat = "XLSX" | "CSV";

/** Normalize the format argument; the API contract defaults to XLSX. */
export function normalizeShoptifyExportFormat(
	format: string | null | undefined,
): ShoptifyExportFormat {
	if (format === undefined || format === null || format === "") return "XLSX";
	const upper = format.toUpperCase();
	if (upper !== "XLSX" && upper !== "CSV") {
		throw new DomainError(
			"VALIDATION_FAILED",
			`Unsupported export format: ${format}.`,
		);
	}
	return upper;
}

const ORDER_COLUMNS: { header: string; key: string }[] = [
	{ header: "Order", key: "orderNumber" },
	{ header: "Store", key: "shopDomain" },
	{ header: "Customer", key: "customerEmail" },
	{ header: "Financial", key: "financialStatus" },
	{ header: "Fulfillment", key: "fulfillmentStatus" },
	{ header: "Total", key: "totalPrice" },
	{ header: "Currency", key: "currency" },
	{ header: "Exception", key: "exception" },
	{ header: "Created", key: "createdAt" },
];

const PRODUCT_COLUMNS: { header: string; key: string }[] = [
	{ header: "Product", key: "title" },
	{ header: "Store", key: "storeName" },
	{ header: "SKU", key: "sku" },
	{ header: "Master SKU", key: "masterSku" },
	{ header: "Price", key: "price" },
	{ header: "Available", key: "availableQuantity" },
	{ header: "Low stock", key: "lowStock" },
];

/** Export the order listing (filtered exactly like the read it mirrors). */
export async function exportShoptifyOrders(
	ctx: ViewerContext,
	args: { filter: OrderFilter; format?: string | null },
): Promise<{
	id: string;
	fileName: string;
	mimeType: string;
	format: string;
	url: string;
}> {
	const format = normalizeShoptifyExportFormat(args.format);
	const { rows } = await listOrders(ctx.db, args.filter, {
		offset: 0,
		limit: 1000,
	});

	const records = rows.map((row) => ({
		orderNumber: row.orderNumber ?? row.shopifyOrderId,
		shopDomain: row.storeName ?? row.storeId,
		customerEmail: row.customerEmail ?? "",
		financialStatus: row.financialStatus ?? "",
		fulfillmentStatus: row.fulfillmentStatus ?? "",
		totalPrice: (row.totalPrice / 100).toFixed(2),
		currency: row.currency,
		exception: row.hasException ? (row.exceptionReason ?? "YES") : "",
		createdAt: row.createdAt.toISOString(),
	}));

	return persistListing(ctx, {
		baseName: "shoptify-orders",
		format,
		columns: ORDER_COLUMNS,
		records,
	});
}

/** Export the catalog listing (products with their variants). */
export async function exportShoptifyProducts(
	ctx: ViewerContext,
	args: { filter: ProductFilter; format?: string | null },
): Promise<{
	id: string;
	fileName: string;
	mimeType: string;
	format: string;
	url: string;
}> {
	const format = normalizeShoptifyExportFormat(args.format);
	const { rows } = await listProducts(ctx.db, args.filter, {
		offset: 0,
		limit: 1000,
	});

	const records = rows.flatMap((product) =>
		product.variants.map((variant) => ({
			title: product.title,
			storeName: variant.storeName ?? variant.storeId,
			sku: variant.sku ?? "",
			masterSku: variant.masterSku ?? "",
			price: variant.price === null ? "" : (variant.price / 100).toFixed(2),
			availableQuantity: variant.availableQuantity,
			lowStock: variant.isLowStock ? "YES" : "",
		})),
	);

	return persistListing(ctx, {
		baseName: "shoptify-products",
		format,
		columns: PRODUCT_COLUMNS,
		records,
	});
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

interface PersistArgs {
	baseName: string;
	format: ShoptifyExportFormat;
	columns: { header: string; key: string }[];
	records: Record<string, string | number>[];
}

async function persistListing(
	ctx: ViewerContext,
	args: PersistArgs,
): Promise<{
	id: string;
	fileName: string;
	mimeType: string;
	format: string;
	url: string;
}> {
	const config: AppConfig = ctx.config;
	const directory = config.exportDir;
	await mkdir(directory, { recursive: true });

	const format = args.format;
	const fileName = `${args.baseName}-${Date.now()}.${format === "CSV" ? "csv" : "xlsx"}`;
	const storagePath = join(directory, fileName);

	if (format === "CSV") {
		await writeFile(
			storagePath,
			toCsv(
				args.columns.map((column) => column.header),
				args.records.map((record) =>
					args.columns.map((column) => record[column.key] ?? ""),
				),
			),
			"utf8",
		);
	} else {
		const workbook = new ExcelJS.Workbook();
		const sheet = workbook.addWorksheet(args.baseName);
		sheet.addRow(args.columns.map((column) => column.header));
		for (const record of args.records) {
			sheet.addRow(args.columns.map((column) => record[column.key] ?? ""));
		}
		await workbook.xlsx.writeFile(storagePath);
	}

	const id = crypto.randomUUID();
	const mimeType =
		format === "CSV"
			? "text/csv"
			: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
	const byteSize = (await stat(storagePath)).size;
	await ctx.db.insert(exportArtifacts).values({
		id,
		userId: ctx.viewer?.id ?? null,
		fileName,
		mimeType,
		format,
		storagePath,
		byteSize,
	});

	return {
		id,
		fileName,
		mimeType,
		format,
		url: `/api/v1/exports/${id}`,
	};
}

/** Minimal RFC-4180 CSV writer (quotes, embedded quotes and newlines). */
function toCsv(headers: string[], rows: (string | number)[][]): string {
	const escapeCell = (value: string | number): string => {
		const text = String(value);
		return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	return [
		headers.map(escapeCell).join(","),
		...rows.map((row) => row.map(escapeCell).join(",")),
	].join("\r\n");
}

/** Exported for the money-formatting convention the listings share. */
export { toMinorUnits };
