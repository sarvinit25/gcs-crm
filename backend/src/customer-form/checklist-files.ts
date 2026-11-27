// Which checklist line each uploaded file belongs under. The line the customer pressed Upload on is remembered; a file without
// one (added by staff, or before lines were remembered) is placed by what its name clearly says, and otherwise left unplaced, so
// a line is never shown as received because of some other document of the same kind.

export type Line = { label: string; category: string };
export type Filed = { id: string; category: string; fileName: string; checklistItem?: string | null };

/** Words that name one particular document, as people write them in labels and file names. */
const KINDS: RegExp[] = [
  /\bpan\b/,
  /aadh?a+r/,
  /passport[- ]size|photograph|\bphoto\b/,
  /electric|e[- ]?bill|light bill|voter|address proof|\bpassport\b(?![- ]size)/,
  /\bgst|gstr/,
  /udyam|udyog|msme/,
  /partne\w*|\bmoa\b|\baoa\b/,
  /shop act|gumasta/,
  /\bitr\b|income tax return|computation|\bcoi\b/,
  /p&l|balance sheet|audit/,
  /form ?16/,
  /salary slip|pay ?slip/,
  /occupancy|\boc\b/,
  /share certificate/,
  /agreement|\bafs\b|title|chain|sale deed/,
  /sanction/,
  /\bsoa\b|statement of account/,
  /tax receipt|property tax|maintenance/,
];

const clean = (s: string) => s.toLowerCase().replace(/[_]+/g, " ");

/** For each file id, the label of its line, or null when it cannot honestly be placed. */
export function placeDocuments(lines: Line[], files: Filed[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const f of files) {
    const here = lines.filter((l) => l.category === f.category);
    const chosen = here.find((l) => l.label === f.checklistItem);
    if (chosen) {
      out.set(f.id, chosen.label);
      continue;
    }
    if (here.length === 1) {
      out.set(f.id, here[0]!.label);
      continue;
    }
    const name = clean(f.fileName);
    const kind = KINDS.find((k) => k.test(name) && here.some((l) => k.test(clean(l.label))));
    out.set(f.id, kind ? here.find((l) => kind.test(clean(l.label)))!.label : null);
  }
  return out;
}
