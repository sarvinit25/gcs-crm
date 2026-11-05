/**
 * Sets a new password for one staff account and lets the person back in — for when the password is lost.
 * Run on the server, where the database is:
 *
 *   ADMIN_EMAIL=admin@growthcapitalservices.in NEW_PASSWORD='a long new password' npm run reset:admin
 *
 * The person must choose their own password at the next sign-in. Any lock from too many wrong attempts is
 * cleared and every session already open is ended. Two-step login, if on, is left as it is.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.NEW_PASSWORD ?? "";
  if (!email) throw new Error("Set ADMIN_EMAIL to the account's email address.");
  if (password.length < 10) throw new Error("Set NEW_PASSWORD to at least 10 characters.");

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No staff account has the email ${email}.`);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: true,
      active: true,
      tokenVersion: { increment: 1 },
    },
  });
  await prisma.loginLock.deleteMany({ where: { subject: { in: [`staff:${email}`, `staff-2fa:${user.id}`] } } });
  console.log(`Password reset for ${email}. They must choose their own at the next sign-in.`);
}

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
