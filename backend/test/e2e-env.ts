import { config } from "dotenv";

config(); // pick up DATABASE_URL from .env for the server address and credentials

const base = process.env.DATABASE_URL ?? "postgresql://gcs:gcs@localhost:5433/gcs_crm?schema=public";

/** The same server as development, but a database of its own that only tests touch. */
const swapDb = (url: string, db: string) => url.replace(/\/[^/?]+(\?|$)/, `/${db}$1`);

export const E2E_DB_URL = swapDb(base, "gcs_crm_e2e");
export const ADMIN_DB_URL = swapDb(base, "postgres");
