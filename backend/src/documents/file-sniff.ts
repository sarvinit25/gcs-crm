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

const OFFICE: { marker: string; mime: string; extension: string }[] = [
  { marker: "word/", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: ".docx" },
  { marker: "xl/", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: ".xlsx" },
  { marker: "ppt/", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: ".pptx" },
];

/**
 * What a customer may send on WhatsApp: everything detectFile knows, plus the other things people really send (a video of a
 * property, a voice note, a Word agreement, an Excel sheet). Still decided by the first bytes, never by the name, and kept
 * in the private bucket for staff to open; nothing here is ever run. Staff uploads keep the stricter detectFile.
 */
export function detectMedia(buf: Buffer): DetectedFile | null {
  const strict = detectFile(buf);
  if (strict) return strict;
  if (buf.length < 12) return null;
  if (ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (/^M4[ABP] $/.test(brand)) return { mime: "audio/mp4", extension: ".m4a" };
    if (brand === "qt  ") return { mime: "video/quicktime", extension: ".mov" };
    if (brand.startsWith("3g")) return { mime: "video/3gpp", extension: ".3gp" };
    return { mime: "video/mp4", extension: ".mp4" };
  }
  if (ascii(buf, 0, 4) === "OggS") return { mime: "audio/ogg", extension: ".ogg" };
  if (ascii(buf, 0, 5) === "#!AMR") return { mime: "audio/amr", extension: ".amr" };
  if (ascii(buf, 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0)) return { mime: "audio/mpeg", extension: ".mp3" };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    // A zip is only taken for an Office file when its early entries are named like one.
    const head = buf.subarray(0, 8192).toString("latin1");
    const found = OFFICE.find((o) => head.includes(o.marker));
    return found ? { mime: found.mime, extension: found.extension } : null;
  }
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { mime: "application/vnd.ms-office", extension: ".doc" };
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
