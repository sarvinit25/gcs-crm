/**
 * Works out what an uploaded file really is from its first bytes, instead of
 * trusting the type the browser claimed or the extension in the name. Only the
 * formats KYC and loan files actually come in are recognised.
 */
export type DetectedFile = { mime: string; extension: string };

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

const startsWith = (buf: Buffer, bytes: number[], at = 0) => bytes.every((b, i) => buf[at + i] === b);
const ascii = (buf: Buffer, from: number, to: number) => buf.subarray(from, to).toString("latin1");

export function detectFile(buf: Buffer): DetectedFile | null {
  if (buf.length < 12) return null;
  // Some scanners put a few bytes before the PDF header; the spec allows up to 1024.
  if (buf.subarray(0, 1024).includes("%PDF-")) return { mime: "application/pdf", extension: ".pdf" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extension: ".jpg" };
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", extension: ".png" };
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return { mime: "image/webp", extension: ".webp" };
  if (ascii(buf, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(buf, 8, 12))) return { mime: "image/heic", extension: ".heic" };
  return null;
}

/** A name that is safe to show, store and put in a download header. */
export function safeFileName(name: string, fallbackExtension = ""): string {
  const base = name
    .replace(/[\u0000-\u001f\u007f\\/]/g, "") // control characters and path separators
    .replace(/["<>|:*?]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150);
  return base || `document${fallbackExtension}`;
}
