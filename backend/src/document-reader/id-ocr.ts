// The words on a card, read on OUR OWN server: nothing is sent anywhere. A PDF with real text is read directly; a scan or a
// photo is turned into clean pictures and read with Tesseract. Working files are removed straight away and the text is never
// logged or stored.

import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const OPTS = { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 };

export async function readIdText(buffer: Buffer, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (b: Buffer, o?: object) => Promise<{ text: string }>;
    const text = (await pdfParse(buffer, { max: 3 }).catch(() => ({ text: "" }))).text;
    if (text.replace(/\s/g, "").length > 80) return text;
  } else if (!/^image\/(jpeg|png|webp)$/.test(mime)) return "";

  const dir = await mkdtemp(join(tmpdir(), "gcs-id-"));
  try {
    if (mime === "application/pdf") {
      await writeFile(join(dir, "in.pdf"), buffer);
      await run(process.env.GS_BIN || "gs", ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-sDEVICE=pnggray", "-r250", "-dLastPage=3", `-sOutputFile=${join(dir, "page-%d.png")}`, join(dir, "in.pdf")], OPTS);
    } else {
      const sharp = (await import("sharp")).default;
      await sharp(buffer).rotate().resize({ width: 2200, withoutEnlargement: false }).grayscale().normalise().png().toFile(join(dir, "page-1.png"));
    }
    let text = "";
    for (const page of (await readdir(dir)).filter((f) => f.endsWith(".png")).sort()) {
      // Two ways of laying out the page: cards are often missed by one and caught by the other.
      for (const mode of ["3", "11"]) text += `\n${(await run(process.env.TESSERACT_BIN || "tesseract", [join(dir, page), "stdout", "-l", "eng", "--psm", mode], OPTS)).stdout}`;
    }
    return text;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
