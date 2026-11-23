/**
 * Row → GraphQL shape mappers for the Shopify commerce module.
 *
 * Mirrors the pattern of `backend/src/graphql/shapes.ts`: the domain stores
 * rows, these functions present them. Money crosses the API as integer minor
 * units; JSON columns are parsed here so the API never hands clients
 * stringified JSON.
 */

import type {
	ShoptifyAutomationRuleRow,
	ShoptifyCustomerRow,
	ShoptifyFulfillmentRow,
	ShoptifyOrderExpenseRow,
	ShoptifyOrderRow,
	ShoptifyPayoutRow,
	ShoptifyProductRow,
	ShoptifyRefundRow,
	ShoptifyStoreRow,
	ShoptifyVariantRow,
} from "../../db/schema";

export interface ShoptifyStoreShape {
	id: string;
	name: string;
	shopDomain: string;
	currency: string;
	scopes: string[] | null;
	isActive: boolean;
	lastSyncAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export function toStore(row: ShoptifyStoreRow): ShoptifyStoreShape {
	return {
		id: row.id,
		name: row.name,
		shopDomain: row.shopDomain,
		currency: row.currency,
		scopes: row.scopes ? row.scopes.split(",").filter(Boolean) : null,
		isActive: row.isActive,
		lastSyncAt: row.lastSyncAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export interface ShoptifyFulfillmentShape {
	id: string;
	orderId: string;
	shopifyFulfillmentId: string | null;
	trackingCompany: string | null;
	trackingNumber: string | null;
	trackingUrl: string | null;
	shipmentStatus: string | null;
	createdAt: Date;
}

export function toFulfillment(
	row: ShoptifyFulfillmentRow,
): ShoptifyFulfillmentShape {
	return {
		id: row.id,
		orderId: row.orderId,
		shopifyFulfillmentId: row.shopifyFulfillmentId,
		trackingCompany: row.trackingCompany,
		trackingNumber: row.trackingNumber,
		trackingUrl: row.trackingUrl,
		shipmentStatus: row.shipmentStatus,
		createdAt: row.createdAt,
	};
}

export interface ShoptifyRefundShape {
	id: string;
	orderId: string;
	shopifyRefundId: string;
	amount: number;
	currency: string;
	reason: string | null;
	createdAt: Date;
}

export function toRefund(row: ShoptifyRefundRow): ShoptifyRefundShape {
	return {
		id: row.id,
		orderId: row.orderId,
		shopifyRefundId: row.shopifyRefundId,
		amount: row.amount,
		currency: row.currency,
		reason: row.reason,
		createdAt: row.createdAt,
	};
}

export interface ShoptifyOrderShape {
	id: string;
	storeId: string;
	storeName: string | null;
	shopifyOrderId: string;
	orderNumber: string | null;
	customerEmail: string | null;
	customerPhone: string | null;
	shippingAddress: unknown | null;
	financialStatus: string | null;
	fulfillmentStatus: string | null;
	totalPrice: number;
	currency: string;
	tags: string[] | null;
	note: string | null;
	hasException: boolean;
	exceptionReason: string | null;
	netProfit: number | null;
	fulfillments: ShoptifyFulfillmentShape[];
	refunds: ShoptifyRefundShape[];
	shopifyCreatedAt: Date | null;
	createdAt: Date;
	updatedAt: Date;
}

export function toOrder(
	row: ShoptifyOrderRow,
	related?: {
		storeName?: string | null;
		fulfillments?: ShoptifyFulfillmentRow[];
		refunds?: ShoptifyRefundRow[];
		expense?: ShoptifyOrderExpenseRow | null;
	},
): ShoptifyOrderShape {
	return {
		id: row.id,
		storeId: row.storeId,
		storeName: related?.storeName ?? null,
		shopifyOrderId: row.shopifyOrderId,
		orderNumber: row.orderNumber,
		customerEmail: row.customerEmail,
		customerPhone: row.customerPhone,
		shippingAddress: parseJson(row.shippingAddress),
		financialStatus: row.financialStatus,
		fulfillmentStatus: row.fulfillmentStatus,
		totalPrice: row.totalPrice,
		currency: row.currency,
		tags: row.tags ? row.tags.split(",").filter(Boolean) : null,
		note: row.note,
		hasException: row.hasException,
		exceptionReason: row.exceptionReason,
		netProfit: related?.expense?.netProfit ?? null,
		fulfillments: (related?.fulfillments ?? []).map(toFulfillment),
		refunds: (related?.refunds ?? []).map(toRefund),
		shopifyCreatedAt: row.shopifyCreatedAt ?? null,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

export interface ShoptifyVariantShape {
	id: string;
	productId: string;
	storeId: string;
	storeName: string | null;
	shopifyVariantId: string;
	sku: string | null;
	masterSku: string | null;
	price: number | null;
	costOfGoods: number | null;
	availableQuantity: number;
	minStockLevel: number | null;
	isLowStock: boolean;
}

export function toVariant(
	row: ShoptifyVariantRow,
	related?: { storeName?: string | null },
): ShoptifyVariantShape {
	return {
		id: row.id,
		productId: row.productId,
		storeId: row.storeId,
		storeName: related?.storeName ?? null,
		shopifyVariantId: row.shopifyVariantId,
		sku: row.sku,
		masterSku: row.masterSku,
		price: row.price,
		costOfGoods: row.costOfGoods,
		availableQuantity: row.availableQuantity,
		minStockLevel: row.minStockLevel,
		isLowStock:
			row.minStockLevel !== null && row.availableQuantity < row.minStockLevel,
	};
}

export interface ShoptifyProductShape {
	id: string;
	storeId: string;
	shopifyProductId: string;
	title: string;
	status: string | null;
	variants: ShoptifyVariantShape[];
	updatedAt: Date;
}

export function toProduct(
	row: ShoptifyProductRow,
	variants: ShoptifyVariantRow[],
): ShoptifyProductShape {
	return {
		id: row.id,
		storeId: row.storeId,
		shopifyProductId: row.shopifyProductId,
		title: row.title,
		status: row.status,
		variants: variants.map((variant) => toVariant(variant)),
		updatedAt: row.updatedAt,
	};
}

export interface ShoptifyCustomerShape {
	id: string;
	email: string | null;
	phone: string | null;
	totalOrdersCount: number;
	totalSpent: number;
	isBlacklisted: boolean;
	isHighRisk: boolean;
	notes: string | null;
}

export function toCustomer(row: ShoptifyCustomerRow): ShoptifyCustomerShape {
	return {
		id: row.id,
		email: row.email,
		phone: row.phone,
		totalOrdersCount: row.totalOrdersCount,
		totalSpent: row.totalSpent,
		isBlacklisted: row.isBlacklisted,
		isHighRisk: row.isHighRisk,
		notes: row.notes,
	};
}

export interface ShoptifyPayoutShape {
	id: string;
	storeId: string;
	storeName: string | null;
	shopifyPayoutId: string;
	amount: number;
	currency: string;
	status: string;
	payoutDate: Date | null;
	createdAt: Date;
}

export function toPayout(
	row: ShoptifyPayoutRow,
	related?: { storeName?: string | null },
): ShoptifyPayoutShape {
	return {
		id: row.id,
		storeId: row.storeId,
		storeName: related?.storeName ?? null,
		shopifyPayoutId: row.shopifyPayoutId,
		amount: row.amount,
		currency: row.currency,
		status: row.status,
		payoutDate: row.payoutDate ?? null,
		createdAt: row.createdAt,
	};
}

export interface ShoptifyRuleShape {
	id: string;
	name: string;
	storeId: string | null;
	storeName: string | null;
	triggerEvent: string;
	conditions: unknown | null;
	actions: unknown | null;
	isActive: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export function toRule(
	row: ShoptifyAutomationRuleRow,
	related?: { storeName?: string | null },
): ShoptifyRuleShape {
	return {
		id: row.id,
		name: row.name,
		storeId: row.storeId,
		storeName: related?.storeName ?? null,
		triggerEvent: row.triggerEvent,
		conditions: parseJson(row.conditions),
		actions: parseJson(row.actions),
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

/** Parse a JSON-as-text column; malformed values surface as null, not errors. */
export function parseJson(value: string | null): unknown | null {
	if (value === null) return null;
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

/**
 * Convert a Shopify money string ("10.00") to integer minor units.
 *
 * The string is split rather than floated to avoid binary rounding on
 * currency values.
 */
export function toMinorUnits(
	value: string | number | undefined | null,
): number {
	if (value === undefined || value === null) return 0;
	if (typeof value === "number") return Math.round(value * 100);
	const parsed = Number.parseFloat(value);
	if (Number.isNaN(parsed)) return 0;
	const negative = parsed < 0;
	const [whole, fraction = ""] = value.replace("-", "").split(".");
	const minor = Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, "0"));
	return negative ? -minor : minor;
}
