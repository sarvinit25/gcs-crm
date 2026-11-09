import { entries, part } from "./docx-text";

// An Excel (.xlsx) workbook is a zip of XML parts, like a Word file. This turns each sheet into plain rows of text
// (cells separated by " | ") so the reader can treat a lender's product sheet like any other page.

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1]!.toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e.toLowerCase()] ?? ""),
  );
const plain = (xml: string) => decode(xml.replace(/<[^>]+>/g, ""));

/** True for a real .xlsx: a zip holding Excel's workbook part. (The older .xls format is not.) */
export function isXlsx(buf: Buffer): boolean {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) return false;
  const e = entries(buf);
  return e.has("xl/workbook.xml") && e.has("[Content_Types].xml");
}

/** "C7" is column index 2: used to keep empty cells in their place. */
const colIndex = (ref: string) => [...ref.replace(/[^A-Z]/gi, "").toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Every sheet's cells as text rows, with the sheet's name above each. Empty rows and trailing empty cells are dropped. */
export function readXlsx(buf: Buffer): string {
  const all = entries(buf);
  const read = (name: string) => {
    const e = all.get(name);
    const b = e ? part(buf, e) : null;
    return b ? b.toString("utf8") : null;
  };
  const sharedXml = read("xl/sharedStrings.xml") ?? "";
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => plain(m[1]!));
  const names = [...(read("xl/workbook.xml") ?? "").matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g)].map((m) => decode(m[1]!));
  const sheetFiles = [...all.keys()]
    .filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => parseInt(a.replace(/\D/g, ""), 10) - parseInt(b.replace(/\D/g, ""), 10));
  const out: string[] = [];
  sheetFiles.forEach((file, i) => {
    const xml = read(file) ?? "";
    const rows: string[] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]!;
        const body = c[2] ?? "";
        const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
        let v: string;
        if (type === "s") v = shared[Number(/<v>([^<]*)<\/v>/.exec(body)?.[1])] ?? "";
        else if (type === "inlineStr") v = plain(body);
        else v = decode(/<v>([^<]*)<\/v>/.exec(body)?.[1] ?? "");
        if (ref) while (cells.length < colIndex(ref)) cells.push("");
        cells.push(v.replace(/\s+/g, " ").trim());
      }
      while (cells.length && !cells[cells.length - 1]) cells.pop();
      if (cells.length) rows.push(cells.join(" | "));
    }
    if (rows.length) out.push(`Sheet: ${names[i] ?? `Sheet ${i + 1}`}\n${rows.join("\n")}`);
  });
  return out.join("\n\n").slice(0, 60_000);
}
