import { E2E_DB_URL } from "./e2e-env";

// Must run before anything reads the environment: point the app at the throwaway database.
process.env.DATABASE_URL = E2E_DB_URL;
process.env.NODE_ENV = "test";

// Tests must never send anything real. The developer's .env can hold live mail, WhatsApp, SMS and AI keys, and the tests
// create accounts and leads that would otherwise email and message real services (a test account at example.com once
// bounced a message into the company mailbox). Blank them before the app reads its configuration; dotenv does not
// override a variable that is already set, even to an empty string.
for (const key of [
  "ZOHO_CLIENT_ID", "ZOHO_CLIENT_SECRET", "ZOHO_REFRESH_TOKEN", "ZOHO_ACCOUNT_ID", "ZOHO_FROM_ADDRESS",
  "SMS_PROVIDER", "MSG91_AUTH_KEY", "MSG91_TEMPLATE_ID", "MSG91_ID_TEMPLATE_ID",
  "OPENAI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_WABA_ID", "WHATSAPP_PROVIDER",
]) {
  process.env[key] = "";
}
