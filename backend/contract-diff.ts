/**
 * Contract parity check.
 *
 * Verifies the Job mutations and types documented in
 * `API_CONTACT_SPECIFICATION.md` §6.1 match the SDL the service implements
 * (`backend/src/graphql/schema.ts`): every documented mutation is implemented,
 * and the completion-request types carry the documented fields.
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

const spec = readFileSync(SPEC, "utf8");
const jobsSection = sectionBody(spec, "### 6.1 Jobs & Projects");

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

if (failures.length > 0) {
	console.error("Contract parity failed:");
	for (const failure of failures) console.error(` - ${failure}`);
	process.exit(1);
}

console.log(
	`Contract parity holds for ${DOCUMENTED_MUTATIONS.length} Jobs mutations, ` +
		`${NEW_TYPES.length} completion-request types and 2 Task fields.`,
);
