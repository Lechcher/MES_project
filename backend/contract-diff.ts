/**
 * Contract parity check.
 *
 * Verifies the Job mutations and types documented in
 * `API_CONTACT_SPECIFICATION.md` §6.1 match the SDL the service implements
 * (`backend/src/graphql/schema.ts`): every documented mutation is implemented,
 * and the completion-request types carry the documented fields. The Performance
 * section (§6.3) and the print/export operations (§7.2) are checked the same
 * way, so a period input, a dashboard type, or an operation signature cannot
 * drift between the document and the served schema.
 *
 * Run: `bun run contract-diff.ts` from `backend/`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { typeDefs } from "./src/graphql/schema";

const SPEC = resolve(import.meta.dir, "../API_CONTACT_SPECIFICATION.md");

const NEW_TYPES = [
	"TaskCompletionRequest",
	"SubmitTaskCompletionRequestInput",
	"ReviewTaskCompletionRequestInput",
] as const;

const DOCUMENTED_MUTATIONS = [
	"createTask",
	"acceptTask",
	"logTaskProgress",
	"submitTaskReport",
	"approveTask",
	"returnTask",
	"cancelTask",
	"requestExtension",
	"explainLateSubmission",
	"reviewTaskRequest",
	"submitTaskCompletionRequest",
	"reviewTaskCompletionRequest",
] as const;

/** The Performance queries documented in §6.3. */
const PERFORMANCE_QUERIES = [
	"personalKpiDashboard",
	"kpiScoreEvents",
	"kpiPointRules",
	"kpiAuditLevel1Company",
	"kpiAuditLevel2Department",
	"kpiAuditLevel3Employee",
] as const;

/** The Performance types documented in §6.3. */
const PERFORMANCE_TYPES = [
	"KpiMonth",
	"KpiMonthlyTotal",
	"KpiPeriodSummary",
	"PersonalKpiDashboard",
] as const;

/** The Performance inputs documented in §6.3. */
const PERFORMANCE_INPUTS = [
	"KpiMonthInput",
	"KpiPeriodSelectionInput",
	"KpiAuditFilter",
] as const;

/** The Performance mutations documented in §7.2. */
const PERFORMANCE_EXPORT_MUTATIONS = [
	"printKpiReport",
	"exportAuditWorkbook",
] as const;

function sectionBody(text: string, header: string): string {
	const start = text.indexOf(header);
	if (start < 0) throw new Error(`Section ${header} is missing from the spec`);
	const rest = text.slice(start + header.length);
	const end = rest.indexOf("\n### ");
	return end < 0 ? rest : rest.slice(0, end);
}

function sdlOf(
	body: string,
	name: string,
	keyword: "type" | "input",
): string[] {
	// Both the document and the SDL indent fields two spaces and close the
	// block with a brace at either indentation, so tolerate both.
	const pattern = new RegExp(`${keyword} ${name} \\{([\\s\\S]*?)\\n\\s*\\}`);
	const match = pattern.exec(body);
	if (!match) throw new Error(`${keyword} ${name} is missing from §6.1`);
	return (
		match[1]
			.split("\n")
			.map((line) => line.replace(/^[ \t]+/, "").replace(/,$/, ""))
			// A `#` line documents the field below it; it is not itself a field.
			.map((line) => line.replace(/#.*$/, "").trim())
			.filter((line) => line.length > 0)
	);
}

/**
 * The body of a `{ … }` block, from its header to its closing brace.
 *
 * The header is matched loosely so the document's `extend type Query {` and
 * the schema's `type Query {` resolve to the same block.
 */
function blockOf(body: string, header: string): string {
	const start = body.indexOf(header);
	if (start < 0) throw new Error(`${header} is missing from the spec`);
	const from = body.indexOf("{", start);
	let depth = 0;
	for (let index = from; index < body.length; index += 1) {
		if (body[index] === "{") depth += 1;
		else if (body[index] === "}") {
			depth -= 1;
			if (depth === 0) return body.slice(from, index + 1);
		}
	}
	throw new Error(`${header} is not closed`);
}

/**
 * An operation's signature, so the document and the SDL can be compared.
 *
 * Whitespace and commas are insignificant in GraphQL, so they are removed:
 * the SDL writes a long signature across several lines without commas, and
 * the document writes it on one line with them.
 */
function signatureOf(body: string, operation: string): string | null {
	const match = new RegExp(
		`\\b${operation}\\s*(\\([^)]*\\))?\\s*:\\s*([A-Za-z0-9_!\\[\\]]+)`,
	).exec(body);
	return match ? match[0].replace(/[\s,]+/g, "") : null;
}

const spec = readFileSync(SPEC, "utf8");
const jobsSection = sectionBody(spec, "### 6.1 Jobs & Projects");
const performanceSection = sectionBody(spec, "### 6.3 Performance & Audit");
const exportSection = sectionBody(spec, "### 7.2 Print / export operations");

const failures: string[] = [];

for (const mutation of DOCUMENTED_MUTATIONS) {
	if (!jobsSection.includes(`  ${mutation}(`)) {
		failures.push(`§6.1 does not document the ${mutation} mutation`);
	}
	if (!typeDefs.includes(`${mutation}(`)) {
		failures.push(`the schema does not implement ${mutation}`);
	}
}

for (const name of NEW_TYPES) {
	const keyword = name.endsWith("Input") ? "input" : "type";
	const documented = sdlOf(jobsSection, name, keyword);
	const implemented = sdlOf(typeDefs, name, keyword);
	const missing = documented.filter((field) => !implemented.includes(field));
	if (missing.length > 0) {
		failures.push(`${name}: implemented SDL is missing ${missing.join(", ")}`);
	}
}

for (const field of [
	"journey: [TaskCompletionRequest!]!",
	"plannedStageCount: Int",
]) {
	if (!sdlOf(jobsSection, "Task", "type").includes(field)) {
		failures.push(`§6.1's Task type is missing ${field}`);
	}
	if (!sdlOf(typeDefs, "Task", "type").includes(field)) {
		failures.push(`the schema's Task type is missing ${field}`);
	}
}

/* ── Performance (§6.3) and the Performance exports (§7.2) ─────────── */

for (const [names, keyword] of [
	[PERFORMANCE_TYPES, "type"],
	[PERFORMANCE_INPUTS, "input"],
] as const) {
	for (const name of names) {
		const documented = sdlOf(performanceSection, name, keyword);
		const implemented = sdlOf(typeDefs, name, keyword);
		const missing = documented.filter((field) => !implemented.includes(field));
		if (missing.length > 0) {
			failures.push(
				`${name}: implemented SDL is missing ${missing.join(", ")}`,
			);
		}
		const extra = implemented.filter((field) => !documented.includes(field));
		if (extra.length > 0) {
			failures.push(`${name}: §6.3 does not document ${extra.join(", ")}`);
		}
	}
}

// The single-month input is gone from both the document and the schema.
if (performanceSection.includes("input KpiPeriodInput")) {
	failures.push("§6.3 still documents the removed KpiPeriodInput");
}
if (typeDefs.includes("input KpiPeriodInput")) {
	failures.push("the schema still implements the removed KpiPeriodInput");
}

const documentedQueries = blockOf(performanceSection, "type Query {");
const implementedQueries = blockOf(typeDefs, "type Query {");
for (const operation of PERFORMANCE_QUERIES) {
	const documented = signatureOf(documentedQueries, operation);
	const implemented = signatureOf(implementedQueries, operation);
	if (!documented) {
		failures.push(`§6.3 does not document the ${operation} query`);
		continue;
	}
	if (!implemented) {
		failures.push(`the schema does not implement the ${operation} query`);
		continue;
	}
	if (documented !== implemented) {
		failures.push(
			`${operation}: §6.3 documents ${documented} but the schema implements ${implemented}`,
		);
	}
}

const documentedExports = blockOf(exportSection, "type Mutation {");
const implementedExports = blockOf(typeDefs, "type Mutation {");
for (const operation of PERFORMANCE_EXPORT_MUTATIONS) {
	const documented = signatureOf(documentedExports, operation);
	const implemented = signatureOf(implementedExports, operation);
	if (!documented) {
		failures.push(`§7.2 does not document the ${operation} mutation`);
		continue;
	}
	if (!implemented) {
		failures.push(`the schema does not implement the ${operation} mutation`);
		continue;
	}
	if (documented !== implemented) {
		failures.push(
			`${operation}: §7.2 documents ${documented} but the schema implements ${implemented}`,
		);
	}
}

if (failures.length > 0) {
	console.error("Contract parity failed:");
	for (const failure of failures) console.error(` - ${failure}`);
	process.exit(1);
}

console.log(
	`Contract parity holds for ${DOCUMENTED_MUTATIONS.length} Jobs mutations, ` +
		`${NEW_TYPES.length} completion-request types and 2 Task fields, ` +
		`${PERFORMANCE_QUERIES.length} Performance queries, ` +
		`${PERFORMANCE_EXPORT_MUTATIONS.length} Performance exports, and ` +
		`${PERFORMANCE_TYPES.length + PERFORMANCE_INPUTS.length} Performance types and inputs.`,
);
