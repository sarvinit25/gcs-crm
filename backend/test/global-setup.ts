import { execSync } from "node:child_process";
import { E2E_DB_URL } from "./e2e-env";

/** Builds a fresh database from the real migrations and seed, so the tests run against the real schema. */
export default async function setup() {
  // Tests sign in as the seeded admin with the documented default, so switch off the first-login password change for it.
  const env = { ...process.env, DATABASE_URL: E2E_DB_URL, SEED_ADMIN_FORCE_CHANGE: "false" };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" }); // also creates the database if missing
  execSync("npx ts-node --compiler-options '{\"module\":\"commonjs\"}' prisma/seed.ts", { env, stdio: "pipe" });
}
