import { PrismaClient } from "@prisma/client";
import { ADMIN_DB_URL } from "./e2e-env";

export default async function teardown() {
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_DB_URL } } });
  try {
    await admin.$executeRawUnsafe('DROP DATABASE IF EXISTS "gcs_crm_e2e" WITH (FORCE)');
  } finally {
    await admin.$disconnect();
  }
}
