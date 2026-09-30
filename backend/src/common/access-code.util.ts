import { randomInt } from "node:crypto";

// Excludes 0/O and 1/I/L — read aloud over a call or typed off a WhatsApp
// message, these are the pairs people actually mistake for one another.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** An unguessable code for the borrower portal — never a sequential id. */
export function generatePortalAccessCode(length = 8): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
