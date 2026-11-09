import { inflateRawSync } from "zlib";

// A Word (.docx) file is a zip of XML parts. This reads just what a lender's flyer needs: the text, and any pictures
// pasted into the page (a flyer saved in Word is often one big image). It uses only Node's own zlib.

const MAX_PART = 40 * 1024 * 1024;

export type Entry = { name: string; method: number; compSize: number; offset: number };

export function entries(buf: Buffer): Map<string, Entry> {
  const out = new Map<string, Entry>();
  // The end-of-central-directory record is near the end; a zip comment can push it back by up to 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return out;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    out.set(name, { name, method: buf.readUInt16LE(p + 10), compSize: buf.readUInt32LE(p + 20), offset: buf.readUInt32LE(p + 42) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function part(buf: Buffer, e: Entry): Buffer | null {
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) return null;
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const raw = buf.subarray(start, start + e.compSize);
  try {
    // maxOutputLength stops a tiny file that unpacks to gigabytes
    return e.method === 0 ? raw : e.method === 8 ? inflateRawSync(raw, { maxOutputLength: MAX_PART }) : null;
  } catch {
    return null;
  }
}

/** True for a real .docx: a zip holding Word's main document part. (The older .doc format is not.) */
export function isDocx(buf: Buffer): boolean {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) return false;
  const e = entries(buf);
  return e.has("word/document.xml") && e.has("[Content_Types].xml");
}

/** The older binary Word format (.doc), which cannot be read here. */
export const isOldWord = (buf: Buffer) => buf.length > 8 && buf.readUInt32BE(0) === 0xd0cf11e0 && buf.readUInt32BE(4) === 0xa1b11ae1;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** The words of a Word document's XML, with paragraphs on their own lines and table cells separated by " | ". */
export function xmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>\s*<\/w:tc>/g, "</w:tc>")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
      e[0] === "#" ? String.fromCodePoint(e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? ""),
    )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/( \| )+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const IMAGE = /^word\/media\/[^/]+\.(png|jpe?g)$/i;

/** The text of the document, and up to three of its pictures in page order. */
export function readDocx(buf: Buffer): { text: string; images: { buffer: Buffer; mime: string }[] } {
  const all = entries(buf);
  const doc = all.get("word/document.xml");
  const xml = doc ? part(buf, doc) : null;
  const images = [...all.values()]
    .filter((e) => IMAGE.test(e.name))
    .sort((a, b) => a.offset - b.offset)
    .slice(0, 3)
    .map((e) => ({ e, data: part(buf, e) }))
    .filter((x): x is { e: Entry; data: Buffer } => Boolean(x.data) && x.data!.length > 2_000)
    .map(({ e, data }) => ({ buffer: data, mime: /\.png$/i.test(e.name) ? "image/png" : "image/jpeg" }));
  return { text: xml ? xmlToText(xml.toString("utf8")) : "", images };
}
