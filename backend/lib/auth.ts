import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./auth-schema";

const db = drizzle({ client: new Database("sqlite.db"), schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  baseURL: "http://localhost:3000/",
  emailAndPassword: { enabled: true },
});
