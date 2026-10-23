/**
 * Build the executable schema.
 *
 * The contract's SDL is compiled with `buildSchema`, then the resolver maps and
 * object-type field resolvers are attached to the compiled fields. Using
 * GraphQL.js directly keeps the runtime to the packages the stack already
 * declares, with no code-generation step.
 */

import {
	buildSchema,
	type GraphQLFieldResolver,
	type GraphQLSchema,
	isObjectType,
} from "graphql";
import { mutationResolvers, queryResolvers } from "./resolvers";
import { typeDefs } from "./schema";
import {
	dateTimeScalar,
	decimalScalar,
	jsonScalar,
	objectResolvers,
} from "./shapes";

type FieldResolver = GraphQLFieldResolver<unknown, unknown>;

export function makeExecutableSchema(): GraphQLSchema {
	const schema = buildSchema(typeDefs);
	const typeMap = schema.getTypeMap();

	const attach = (typeName: string, fields: Record<string, unknown>): void => {
		const type = typeMap[typeName];
		if (!type || !isObjectType(type)) return;
		const definitions = type.getFields();
		for (const [fieldName, resolver] of Object.entries(fields)) {
			const definition = definitions[fieldName];
			if (definition) {
				definition.resolve = resolver as FieldResolver;
			}
		}
	};

	attach("Query", queryResolvers);
	attach("Mutation", mutationResolvers);
	for (const [typeName, fields] of Object.entries(objectResolvers)) {
		attach(typeName, fields as Record<string, unknown>);
	}

	// Replace the placeholder scalars' behaviour with the real implementations.
	for (const scalar of [dateTimeScalar, jsonScalar, decimalScalar]) {
		const built = typeMap[scalar.name];
		if (built && "serialize" in built) {
			Object.assign(built, {
				serialize: scalar.serialize,
				parseValue: scalar.parseValue,
				parseLiteral: scalar.parseLiteral,
			});
		}
	}

	return schema;
}
