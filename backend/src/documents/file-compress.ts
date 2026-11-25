// Shrinks every file that enters the CRM to the smallest size that is still clearly readable, whichever way it arrived
// (staff upload, customer form, WhatsApp, the AI phone agent, a lender flyer).
//
//   Photos and scans (JPEG, PNG, WebP): the longest side is capped at 2000 px (about 200 dpi on an A4 page, enough to read a
//     PAN card or a bank statement line), the picture is re-encoded at a quality that cannot be told apart by eye for text,
//     the phone's rotation is applied, and location and camera details are stripped.
//   PDFs: the images inside are re-sampled to 150 dpi with Ghostscript (its "ebook" setting), which is the standard
//     readable-but-small level. Text and vector pages are untouched.
//
// It can only ever make things better: if anything fails, the tool is missing, or the result is not clearly smaller, the
// original is stored exactly as it came. A file is never lost or made unreadable by this.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Logger } from "@nestjs/common";
import { detectFile } from "./file-sniff";

const run = promisify(execFile);
const log = new Logger("FileCompress");

/** Files below these sizes are already small; recompressing them only risks quality for no gain. */
export const MIN_IMAGE_BYTES = 150 * 1024;
export const MIN_PDF_BYTES = 300 * 1024;
/** The result must save at least this share, otherwise the original is kept. */
const MIN_SAVING = 0.05;

export type Compressed = { body: Buffer; contentType: string; originalBytes: number; compressed: boolean };

const same = (body: Buffer, contentType: string): Compressed => ({ body, contentType, originalBytes: body.length, compressed: false });

async function shrinkImage(buf: Buffer, mime: string): Promise<Buffer | null> {
  // Loaded on first use so a missing native module can never stop the CRM starting.
  const sharp = (await import("sharp")).default;
  const pass = async (edge: number, quality: number) => {
    let img = sharp(buf, { failOn: "none" }).rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
    if (mime === "image/jpeg") img = img.jpeg({ quality, mozjpeg: true });
    else if (mime === "image/png") img = img.png({ palette: true, quality, effort: 7, compressionLevel: 9 });
    else img = img.webp({ quality, effort: 5 });
    return img.toBuffer();
  };
  let out = await pass(2000, 72);
  // A very heavy file gets a second, firmer pass: still clear, smaller again.
  if (out.length > 1_500_000) out = await pass(1700, 62);
  return out;
}

/** Re-samples the images inside a PDF with Ghostscript. Returns null when Ghostscript is not installed or fails. */
async function shrinkPdf(buf: Buffer): Promise<Buffer | null> {
  const id = randomUUID();
  const input = join(tmpdir(), `gcs-in-${id}.pdf`);
  const output = join(tmpdir(), `gcs-out-${id}.pdf`);
  try {
    await fs.writeFile(input, buf);
    await run(
      process.env.GS_BIN || "gs",
      ["-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.5", "-dPDFSETTINGS=/ebook", "-dDetectDuplicateImages=true", "-dNOPAUSE", "-dBATCH", "-dQUIET", "-dSAFER", `-sOutputFile=${output}`, input],
      { timeout: 90_000 },
    );
    const out = await fs.readFile(output);
    return out.subarray(0, 8).toString("latin1").includes("%PDF-") ? out : null;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") log.warn("Ghostscript (gs) is not installed, so PDFs are stored as they came");
    else log.warn(`A PDF could not be compressed and was kept as it came: ${(e as Error).message.split("\n")[0]}`);
    return null;
  } finally {
    await Promise.allSettled([fs.unlink(input), fs.unlink(output)]);
  }
}

/**
 * The file to store. Same type in, same type out (so the extension and download type never change). Never throws: on any
 * problem the original comes back untouched.
 */
export async function compressFile(buf: Buffer, declaredType: string): Promise<Compressed> {
  try {
    const kind = detectFile(buf);
    if (!kind) return same(buf, declaredType);
    let out: Buffer | null = null;
    if (kind.mime === "application/pdf") {
      if (buf.length < MIN_PDF_BYTES) return same(buf, kind.mime);
      out = await shrinkPdf(buf);
    } else if (kind.mime === "image/jpeg" || kind.mime === "image/png" || kind.mime === "image/webp") {
      if (buf.length < MIN_IMAGE_BYTES) return same(buf, kind.mime);
      out = await shrinkImage(buf, kind.mime);
    } else {
      return same(buf, declaredType); // HEIC and anything else: kept as it is
    }
    if (!out || out.length >= buf.length * (1 - MIN_SAVING)) return same(buf, kind.mime);
    return { body: out, contentType: kind.mime, originalBytes: buf.length, compressed: true };
  } catch (e) {
    log.warn(`Compression skipped, original kept: ${(e as Error).message.split("\n")[0]}`);
    return same(buf, declaredType);
  }
}
