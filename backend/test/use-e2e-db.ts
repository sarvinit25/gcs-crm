import { E2E_DB_URL } from "./e2e-env";

// Must run before anything reads the environment: point the app at the throwaway database.
process.env.DATABASE_URL = E2E_DB_URL;
process.env.NODE_ENV = "test";
