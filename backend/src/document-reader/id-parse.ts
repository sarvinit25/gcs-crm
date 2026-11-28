// What can be taken from the text of a PAN or Aadhaar card. Pure, so it can be tested without a card. Only the last four
// digits of an Aadhaar number ever leave this file.

export type IdDetails = { pan?: string; aadhaarLast4?: string; dob?: string; address?: string; pincode?: string };

// The Verhoeff check digit every Aadhaar number carries: it tells a real number from a misread one or any other 12 digits.
const D = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const P = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export const verhoeffOk = (digits: string) => [...digits].reverse().reduce((c, d, i) => D[c]![P[i % 8]![Number(d)]!]!, 0) === 0;

const isoDay = (d: string, m: string, y: string): string | undefined => {
  const iso = `${y}-${m}-${d}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === iso && Number(y) > 1920 && t.getTime() < Date.now() ? iso : undefined;
};

export function parseId(text: string): IdDetails {
  const out: IdDetails = {};
  const upper = text.toUpperCase();
  // The fourth letter of a PAN says what holds it; P is a person. A firm's PAN is never put on an applicant.
  const pans = [...new Set(upper.match(/\b[A-Z]{3}P[A-Z]\d{4}[A-Z]\b/g) ?? [])];
  if (pans.length === 1) out.pan = pans[0];

  const isAadhaar = /AADHAA?R|UNIQUE IDENTIFICATION|UIDAI|GOVERNMENT OF INDIA|\bVID\b/.test(upper);
  if (isAadhaar) {
    // Three groups of four, not part of the 16-digit virtual ID.
    const numbers = [...text.matchAll(/(?<!\d[ -]?)\b([2-9]\d{3})[ -]?(\d{4})[ -]?(\d{4})\b(?![ -]?\d)/g)].map((m) => m[1]! + m[2]! + m[3]!).filter(verhoeffOk);
    const found = [...new Set(numbers)];
    if (found.length === 1) out.aadhaarLast4 = found[0]!.slice(-4);

    const address = /ADDRESS\s*:?([\s\S]{15,300}?\b[1-9]\d{2}\s?\d{3}\b)/i.exec(text);
    if (address) {
      const line = address[1]!.replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, " ").replace(/[^\x20-\x7e\n]/g, " ").split("\n").map((l) => l.trim()).filter(Boolean).join(", ").replace(/\s+/g, " ").replace(/(,\s*)+/g, ", ").replace(/^[,: -]+/, "").trim();
      const pin = /([1-9]\d{2})\s?(\d{3})\s*$/.exec(line);
      if (pin && line.length >= 15) {
        out.pincode = pin[1]! + pin[2]!;
        out.address = line.slice(0, pin.index).replace(/[,\s-]+$/, "").slice(0, 300);
      }
    }
  }

  // A birth date is taken only from an identity card, and only when the card shows a single one.
  if (out.pan || isAadhaar || /INCOME TAX DEPARTMENT/.test(upper)) {
    const labelled = /(?:DOB|DATE OF BIRTH|BIRTH)\D{0,25}(\d{2})[\/-](\d{2})[\/-](\d{4})/.exec(upper);
    if (labelled) out.dob = isoDay(labelled[1]!, labelled[2]!, labelled[3]!);
    else if (/INCOME TAX|PERMANENT ACCOUNT/.test(upper)) {
      const all = [...new Set([...upper.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map((m) => isoDay(m[1]!, m[2]!, m[3]!)).filter((x): x is string => !!x))];
      if (all.length === 1) out.dob = all[0];
    }
    if (!out.dob) delete out.dob;
  }
  return out;
}

const nameWords = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(zz|test|testing|mr|mrs|ms|shri|smt|dr)\b/g, " ").split(/[^a-z]+/).filter((w) => w.length > 1);

/**
 * Whose card it is, among the people on the file: the one whose first name and surname appear in the card's text or the file
 * name. A relative's name printed on a card (S/O, W/O) is why the first name must be there, and why two matches mean none.
 */
export function whoseCard<T extends { name: string }>(people: T[], text: string, fileName: string): T | null {
  const find = (source: string) => {
    const there = new Set(nameWords(source.replace(/\b[SWDC]\s*\/\s*O\b[^\n,]*/gi, " ").replace(/FATHER'?S? NAME[^\n]*\n[^\n]*/gi, " ")));
    return people.filter((p) => {
      const w = nameWords(p.name);
      return w.length > 0 && there.has(w[0]!) && there.has(w[w.length - 1]!);
    });
  };
  const byFile = find(fileName);
  if (byFile.length === 1) return byFile[0]!;
  const byText = find(text);
  return byText.length === 1 ? byText[0]! : null;
}
