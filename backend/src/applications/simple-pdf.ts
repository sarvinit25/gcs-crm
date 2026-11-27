// A small PDF writer for plain reports: headings, "label: value" lines and tables on A4, in the built-in Helvetica.
import { deflateSync } from "node:zlib";

export type Block =
  | { title: string; subtitle?: string }
  | { heading: string }
  | { pairs: [string, string][] }
  | { table: { head: string[]; widths: number[]; rows: string[][] } }
  | { text: string };

const W = 595;
const H = 842;
const M = 42;
const WIDE = W - M * 2;

/** The built-in font has no rupee sign or Indian scripts, so those are spelt out or marked. */
export const plain = (s: string) =>
  s.replace(/\u20b9\s?/g, "Rs ").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2022|\u00b7/g, "|").replace(/\s+/g, " ").replace(/[^\x20-\x7e]/g, "?").trim();

// Roughly how wide Helvetica draws each character, in thousandths of the font size (a little generous, so text never overflows).
const charWidth = (c: string) => (/[il.,:;'|! ]/.test(c) ? 290 : /[fjrt()\-\/\[\]I]/.test(c) ? 360 : /[mwMW@%]/.test(c) ? 890 : /[A-Z]/.test(c) ? 700 : 570);
export const textWidth = (s: string, size: number) => ([...s].reduce((n, c) => n + charWidth(c), 0) * size) / 1000;

export function wrap(value: string, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (let word of plain(value).split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) <= width) {
      line = next;
      continue;
    }
    if (line) out.push(line);
    // A single word longer than the space (a long number or file name) is cut.
    while (textWidth(word, size) > width && word.length > 1) {
      let n = word.length - 1;
      while (n > 1 && textWidth(word.slice(0, n), size) > width) n--;
      out.push(word.slice(0, n));
      word = word.slice(n);
    }
    line = word;
  }
  out.push(line);
  return out;
}

const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");

export function pdf(blocks: Block[]): Buffer {
  const pages: string[][] = [[]];
  let y = H - M;
  const ops = () => pages[pages.length - 1]!;
  const room = (need: number) => {
    if (y - need < M + 14) {
      pages.push([]);
      y = H - M;
    }
  };
  const write = (s: string, x: number, size: number, bold = false, grey = false) => ops().push(`${grey ? "0.42 g" : "0.07 0.13 0.25 rg"} BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y.toFixed(1)} Td (${esc(s)}) Tj ET`);
  const rule = (weight = 0.5) => ops().push(`0.82 G ${weight} w ${M} ${y.toFixed(1)} m ${W - M} ${y.toFixed(1)} l S`);

  for (const b of blocks) {
    if ("title" in b) {
      room(50);
      y -= 14;
      write(plain(b.title), M, 17, true);
      if (b.subtitle) {
        y -= 15;
        write(plain(b.subtitle), M, 9.5, false, true);
      }
      y -= 8;
      rule(1.2);
    } else if ("heading" in b) {
      room(60); // never leave a heading alone at the foot of a page
      y -= 24;
      write(plain(b.heading), M, 11.5, true);
      y -= 5;
      rule();
    } else if ("text" in b) {
      for (const l of wrap(b.text, 9, WIDE)) {
        room(13);
        y -= 13;
        write(l, M, 9);
      }
    } else if ("pairs" in b) {
      for (const [label, value] of b.pairs) {
        const left = wrap(label, 9, 140);
        const right = wrap(value || "-", 9, WIDE - 150);
        const lines = Math.max(left.length, right.length);
        room(lines * 12 + 2);
        y -= 2;
        for (let i = 0; i < lines; i++) {
          y -= 12;
          if (left[i]) write(left[i]!, M, 9, false, true);
          if (right[i]) write(right[i]!, M + 150, 9);
        }
      }
    } else {
      const { head, widths, rows } = b.table;
      const total = widths.reduce((s, w) => s + w, 0);
      const cols = widths.map((w) => (w / total) * WIDE);
      const row = (cells: string[], bold: boolean) => {
        const wrapped = cells.map((c, i) => wrap(c || "-", 8.5, cols[i]! - 8));
        const lines = Math.max(...wrapped.map((c) => c.length));
        room(lines * 11 + 8);
        y -= 3;
        for (let n = 0; n < lines; n++) {
          y -= 11;
          let x = M;
          wrapped.forEach((c, i) => {
            if (c[n]) write(c[n]!, +x.toFixed(1), 8.5, bold, bold);
            x += cols[i]!;
          });
        }
        y -= 5;
        rule(0.3);
      };
      room(48);
      row(head, true);
      for (const r of rows) {
        const before = pages.length;
        const need = Math.max(...r.map((c, i) => wrap(c || "-", 8.5, cols[i]! - 8).length)) * 11 + 8;
        room(need);
        if (pages.length !== before) row(head, true);
        row(r, false);
      }
    }
  }

  pages.forEach((p, i) => {
    y = M - 14;
    pages[i] = p;
    p.push(`0.42 g BT /F1 7.5 Tf ${M} ${y} Td (Confidential: contains customer information) Tj ET`);
    p.push(`BT /F1 7.5 Tf ${W - M - 50} ${y} Td (Page ${i + 1} of ${pages.length}) Tj ET`);
  });

  const objects: Buffer[] = [];
  const add = (body: string | Buffer) => objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body, "latin1"));
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ")}] >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((p, i) => {
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    const data = deflateSync(Buffer.from(p.join("\n"), "latin1"));
    add(Buffer.concat([Buffer.from(`<< /Length ${data.length} /Filter /FlateDecode >>\nstream\n`), data, Buffer.from("\nendstream")]));
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.5\n")];
  let at = chunks[0]!.length;
  const offsets = objects.map((o, i) => {
    const chunk = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from("\nendobj\n")]);
    chunks.push(chunk);
    const start = at;
    at += chunk.length;
    return start;
  });
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${at}\n%%EOF\n`));
  return Buffer.concat(chunks);
}
