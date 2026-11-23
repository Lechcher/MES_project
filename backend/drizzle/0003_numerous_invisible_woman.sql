CREATE TABLE "shoptify_automation_log" (
	"id" text PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"event_key" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"action_results" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoptify_automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"store_id" text,
	"trigger_event" text NOT NULL,
	"conditions" text,
	"actions" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_shoptify_rules_trigger" CHECK (trigger_event in ('ORDER_CREATED', 'ORDER_UPDATED', 'ORDER_EXCEPTION', 'STOCK_LOW', 'REFUND_CREATED', 'PAYOUT_FAILED'))
);
--> statement-breakpoint
CREATE TABLE "shoptify_customers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"phone" text,
	"total_orders_count" integer DEFAULT 0 NOT NULL,
	"total_spent" integer DEFAULT 0 NOT NULL,
	"is_blacklisted" boolean DEFAULT false NOT NULL,
	"is_high_risk" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_shoptify_customers_contact" CHECK (email is not null or phone is not null)
);
--> statement-breakpoint
CREATE TABLE "shoptify_fulfillments" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"shopify_fulfillment_id" text,
	"tracking_company" text,
	"tracking_number" text,
	"tracking_url" text,
	"shipment_status" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoptify_order_expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"revenue" integer NOT NULL,
	"cogs" integer DEFAULT 0 NOT NULL,
	"shipping" integer DEFAULT 0 NOT NULL,
	"gateway_fee" integer DEFAULT 0 NOT NULL,
	"ad_spend" integer DEFAULT 0 NOT NULL,
	"net_profit" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoptify_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"shopify_order_id" text NOT NULL,
	"order_number" text,
	"customer_email" text,
	"customer_phone" text,
	"shipping_address" text,
	"financial_status" text,
	"fulfillment_status" text,
	"total_price" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"tags" text,
	"note" text,
	"has_exception" boolean DEFAULT false NOT NULL,
	"exception_reason" text,
	"shopify_created_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_shoptify_orders_exception_reason" CHECK (exception_reason is null or exception_reason in ('ADDRESS_INVALID', 'PAYMENT_HELD', 'OUT_OF_STOCK', 'FRAUD_RISK', 'CUSTOMER_EDIT', 'OTHER'))
);
--> statement-breakpoint
CREATE TABLE "shoptify_payouts" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"shopify_payout_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'SCHEDULED' NOT NULL,
	"payout_date" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_shoptify_payouts_status" CHECK (status in ('SCHEDULED', 'IN_TRANSIT', 'PAID', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "shoptify_products" (
	"id" text PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"shopify_product_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoptify_refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"shopify_refund_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoptify_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"shop" text NOT NULL,
	"state" text NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"scope" text,
	"expires" timestamp (3) with time zone,
	"access_token" text NOT NULL,
	"user_id" bigint,
	"first_name" text,
	"last_name" text,
	"email" text,
	"account_owner" boolean,
	"locale" text,
	"collaborator" boolean,
	"email_verified" boolean,
	"refresh_token" text,
	"refresh_token_expires" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoptify_stores" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"shop_domain" text NOT NULL,
	"access_token" text NOT NULL,
	"webhook_secret" text,
	"scopes" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shoptify_stores_shop_domain_unique" UNIQUE("shop_domain")
);
--> statement-breakpoint
CREATE TABLE "shoptify_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"store_id" text NOT NULL,
	"shopify_variant_id" text NOT NULL,
	"sku" text,
	"master_sku" text,
	"price" integer,
	"cost_of_goods" integer,
	"available_quantity" integer DEFAULT 0 NOT NULL,
	"min_stock_level" integer,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" DROP CONSTRAINT "ck_app_settings_module";--> statement-breakpoint
ALTER TABLE "modules" DROP CONSTRAINT "ck_modules_code";--> statement-breakpoint
ALTER TABLE "permissions" DROP CONSTRAINT "ck_permissions_module";--> statement-breakpoint
ALTER TABLE "system_audit_logs" DROP CONSTRAINT "ck_audit_module";--> statement-breakpoint
ALTER TABLE "shoptify_automation_log" ADD CONSTRAINT "shoptify_automation_log_rule_id_shoptify_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."shoptify_automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_automation_rules" ADD CONSTRAINT "shoptify_automation_rules_store_id_shoptify_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."shoptify_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_fulfillments" ADD CONSTRAINT "shoptify_fulfillments_order_id_shoptify_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shoptify_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_order_expenses" ADD CONSTRAINT "shoptify_order_expenses_order_id_shoptify_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shoptify_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_orders" ADD CONSTRAINT "shoptify_orders_store_id_shoptify_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."shoptify_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_payouts" ADD CONSTRAINT "shoptify_payouts_store_id_shoptify_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."shoptify_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_products" ADD CONSTRAINT "shoptify_products_store_id_shoptify_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."shoptify_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_refunds" ADD CONSTRAINT "shoptify_refunds_order_id_shoptify_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shoptify_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_variants" ADD CONSTRAINT "shoptify_variants_product_id_shoptify_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shoptify_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shoptify_variants" ADD CONSTRAINT "shoptify_variants_store_id_shoptify_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."shoptify_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_automation_log_event" ON "shoptify_automation_log" USING btree ("rule_id","event_key");--> statement-breakpoint
CREATE INDEX "idx_shoptify_rules_trigger" ON "shoptify_automation_rules" USING btree ("trigger_event","is_active");--> statement-breakpoint
CREATE INDEX "idx_shoptify_customers_email" ON "shoptify_customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_shoptify_customers_blacklist" ON "shoptify_customers" USING btree ("is_blacklisted");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_fulfillments_shopify" ON "shoptify_fulfillments" USING btree ("order_id","shopify_fulfillment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_order_expenses_order" ON "shoptify_order_expenses" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_orders_store_shopify" ON "shoptify_orders" USING btree ("store_id","shopify_order_id");--> statement-breakpoint
CREATE INDEX "idx_shoptify_orders_store" ON "shoptify_orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "idx_shoptify_orders_status" ON "shoptify_orders" USING btree ("store_id","fulfillment_status");--> statement-breakpoint
CREATE INDEX "idx_shoptify_orders_exception" ON "shoptify_orders" USING btree ("has_exception");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_payouts_store_shopify" ON "shoptify_payouts" USING btree ("store_id","shopify_payout_id");--> statement-breakpoint
CREATE INDEX "idx_shoptify_payouts_status" ON "shoptify_payouts" USING btree ("store_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_products_store_shopify" ON "shoptify_products" USING btree ("store_id","shopify_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_refunds_order_shopify" ON "shoptify_refunds" USING btree ("order_id","shopify_refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_sessions_shop_state" ON "shoptify_sessions" USING btree ("shop","state");--> statement-breakpoint
CREATE INDEX "idx_shoptify_sessions_shop" ON "shoptify_sessions" USING btree ("shop");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_shoptify_variants_store_shopify" ON "shoptify_variants" USING btree ("store_id","shopify_variant_id");--> statement-breakpoint
CREATE INDEX "idx_shoptify_variants_master_sku" ON "shoptify_variants" USING btree ("master_sku");--> statement-breakpoint
CREATE INDEX "idx_shoptify_variants_product" ON "shoptify_variants" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "ck_app_settings_module" CHECK (module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify'));--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "ck_modules_code" CHECK (code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify'));--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "ck_permissions_module" CHECK (module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify'));--> statement-breakpoint
ALTER TABLE "system_audit_logs" ADD CONSTRAINT "ck_audit_module" CHECK (module_code is null or module_code in ('jobs', 'planning', 'performance', 'settings', 'audit-log', 'shoptify'));