// Reading a bank statement into transactions, with no outside service: the file never leaves our server.
// Excel and CSV statements are read by their column headings; a text PDF is read line by line. Where a row does not say
// whether an amount went out or came in, the running balance does: a balance that went up was a credit.

export type Txn = { date: Date; text: string; debit: number; credit: number; balance: number | null };

type Raw = { date: Date; text: string; debit?: number; credit?: number; amounts: number[]; balance: number | null };

export class StatementError extends Error {}

// ─── small readers ─────────────────────────────────────────────────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const utc = (y: number, m: number, d: number): Date | null => {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 2000 && y <= 2100 ? date : null;
};

/** dd/mm/yyyy, dd-mm-yy, dd Mon yyyy, dd-Mon-yy, yyyy-mm-dd, an Excel date: Indian statements put the day first. */
export function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === "number" && v > 36000 && v < 60000) return new Date(Math.round((v - 25569) * 86400000)); // Excel serial date
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return utc(+m[1]!, +m[2]!, +m[3]!);
  m = /^(\d{1,2})[\s/.-]+(\d{1,2})[\s/.-]+(\d{2,4})/.exec(s);
  if (m) return utc(+m[3]!, +m[2]!, +m[1]!);
  m = /^(\d{1,2})[\s/.-]+([A-Za-z]{3})[A-Za-z]*[\s/.,-]+(\d{2,4})/.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[2]!.toLowerCase());
    return mi >= 0 ? utc(+m[3]!, mi + 1, +m[1]!) : null;
  }
  return null;
}

/** "1,23,456.78", "(500.00)", "12,000.00 Cr" -> a number; a Dr suffix makes a balance negative. Empty or a dash is null. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[₹\s]/g, "").replace(/^rs\.?/i, "");
  if (!s || s === "-" || s === "--") return null;
  let neg = false;
  s = s.replace(/\(\s*(dr|cr)\.?\s*\)$/i, "$1"); // "5,000.00(Dr)"
  if (/dr\.?$/i.test(s)) { neg = true; s = s.replace(/dr\.?$/i, ""); }
  else if (/cr\.?$/i.test(s)) s = s.replace(/cr\.?$/i, "");
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  s = s.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

// ─── settling the direction of each amount ─────────────────────────────────

const CREDIT_HINT = /\b(CR|CREDIT|DEPOSIT|SALARY|REFUND|REVERSAL|INTEREST|INT\.?\s?PD|BY\s+(?:TRANSFER|CASH|CLG)|NEFT\s+CR|IMPS\s+CR|RTGS\s+CR|UPI\s+CR)\b/i;

/** Puts transactions in time order (newest-first statements are turned round) and decides each amount's direction. */
export function settle(rawIn: Raw[]): Txn[] {
  let raws = rawIn;
  if (raws.length > 1) {
    const first = raws[0]!.date.getTime();
    const last = raws[raws.length - 1]!.date.getTime();
    if (first > last) raws = [...raws].reverse();
  }
  const out: Txn[] = [];
  let prev: number | null = null;
  for (const r of raws) {
    let debit = 0;
    let credit = 0;
    if (r.debit !== undefined || r.credit !== undefined) {
      debit = Math.abs(r.debit ?? 0);
      credit = Math.abs(r.credit ?? 0);
    } else {
      const cands = r.amounts.map(Math.abs);
      const nonzero = cands.filter((c) => c > 0);
      if (prev !== null && r.balance !== null) {
        const delta = r.balance - prev;
        const hit = cands.find((c) => Math.abs(c - Math.abs(delta)) < 0.02);
        if (hit !== undefined && Math.abs(delta) > 0.01) {
          if (delta > 0) credit = hit; else debit = hit;
        } else if (nonzero.length) {
          const amt = nonzero[0]!;
          if (CREDIT_HINT.test(r.text)) credit = amt; else debit = amt;
        }
      } else if (nonzero.length) {
        const amt = nonzero[0]!;
        if (CREDIT_HINT.test(r.text)) credit = amt; else debit = amt;
      }
    }
    // an opening-balance line or a zero line has no movement: keep its balance and move on
    if (debit === 0 && credit === 0) { if (r.balance !== null) prev = r.balance; continue; }
    out.push({ date: r.date, text: r.text, debit, credit, balance: r.balance });
    if (r.balance !== null) prev = r.balance;
    else if (prev !== null) prev = prev + credit - debit;
  }
  return out;
}

// ─── Excel and CSV: by column headings ─────────────────────────────────────

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");

type Cols = { date: number; text: number; debit: number; credit: number; amount: number; drcr: number; balance: number };

function findHeader(rows: unknown[][]): { at: number; cols: Cols } | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const cells = (rows[i] ?? []).map(norm);
    // short words must match exactly, so "dr" is not mistaken for the "dr/cr" column
    const find = (...needles: string[]) => cells.findIndex((c) => c && needles.some((n) => c === n || (n.length >= 5 && c.startsWith(n))));
    const date = find("txndate", "transactiondate", "trandate", "date", "postdate", "postingdate");
    const balance = find("balance", "closingbalance", "runningbalance", "availablebalance", "bal");
    const text = find("narration", "description", "particulars", "transactiondescription", "remarks", "details", "transactionremarks");
    const debit = find("debit", "withdrawal", "withdrawals", "withdrawalamt", "dr", "debitamount", "withdrawalamount");
    const credit = find("credit", "deposit", "deposits", "depositamt", "cr", "creditamount", "depositamount");
    const amount = (() => {
      const plain = find("amount", "transactionamount", "txnamount");
      return plain >= 0 ? plain : cells.findIndex((c) => c.includes("withdrawal") && c.includes("deposit")); // Kotak: one column for both
    })();
    const drcr = find("drcr", "crdr", "type", "transactiontype", "debitcredit");
    if (date >= 0 && balance >= 0 && text >= 0 && ((debit >= 0 && credit >= 0) || (amount >= 0 && drcr >= 0) || amount >= 0)) {
      return { at: i, cols: { date, text, debit, credit, amount, drcr, balance } };
    }
  }
  return null;
}

/** A statement laid out as rows of cells (an Excel sheet or a CSV). */
export function fromRows(rows: unknown[][]): Raw[] {
  const head = findHeader(rows);
  if (!head) return [];
  const { cols, at } = head;
  const out: Raw[] = [];
  for (const row of rows.slice(at + 1)) {
    const date = parseDate(row[cols.date]);
    if (!date) continue;
    const text = String(row[cols.text] ?? "").replace(/\s+/g, " ").trim();
    const balance = parseMoney(row[cols.balance]);
    if (cols.debit >= 0 && cols.credit >= 0) {
      out.push({ date, text, debit: Math.abs(parseMoney(row[cols.debit]) ?? 0), credit: Math.abs(parseMoney(row[cols.credit]) ?? 0), amounts: [], balance });
    } else {
      const amt = parseMoney(row[cols.amount]);
      if (amt === null) continue;
      const raw = String(row[cols.amount] ?? "");
      const suffix = /\(?\s*(dr|cr)\.?\s*\)?\s*$/i.exec(raw)?.[1]?.toLowerCase() ?? "";
      const kind = cols.drcr >= 0 ? norm(row[cols.drcr]) : suffix;
      if (/^(cr|credit|c)/.test(kind)) out.push({ date, text, credit: Math.abs(amt), debit: 0, amounts: [], balance });
      else if (/^(dr|debit|d|w)/.test(kind)) out.push({ date, text, debit: Math.abs(amt), credit: 0, amounts: [], balance });
      else out.push({ date, text, amounts: [Math.abs(amt)], balance });
    }
  }
  return out;
}

/** A comma-separated file into rows of cells, with quoted cells and doubled quotes understood. */
export function csvRows(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : (first.match(/\t/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  if (rows.length > 200_000) throw new StatementError("That file has too many rows to read");
  return rows;
}

// ─── text PDF: line by line ────────────────────────────────────────────────

const LEAD_DATE = /^\s*(\d{1,2}[\s/.-]+(?:\d{1,2}|[A-Za-z]{3})[A-Za-z]*[\s/.-]+\d{2,4})\b/;
const TAIL_MONEY = /((?:\s*-?\d[\d,]*\.\d{2}(?:\s?(?:Cr|Dr)\b\.?)?){1,4})\s*$/i;
const MONEY_TOKEN = /-?\d[\d,]*\.\d{2}(?:\s?(?:Cr|Dr)\b\.?)?/gi;

/** The text of a statement PDF, one transaction per line, with each transaction's wrapped narration joined on. */
export function fromPdfText(text: string): Raw[] {
  const out: Raw[] = [];
  let last: Raw | null = null;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    const d = LEAD_DATE.exec(line);
    const date = d ? parseDate(d[1]) : null;
    const tail = date ? TAIL_MONEY.exec(line) : null;
    if (date && tail && tail.index > d![0].length - 1) {
      const nums = (tail[1]!.match(MONEY_TOKEN) ?? []).map((t) => parseMoney(t)).filter((n): n is number => n !== null);
      if (nums.length >= 2) {
        let body = line.slice(d![0].length, tail.index).trim();
        const second = LEAD_DATE.exec(body); // a value date after the transaction date
        if (second && parseDate(second[1])) body = body.slice(second[0].length).trim();
        last = { date, text: body.slice(0, 300), amounts: nums.slice(0, -1), balance: nums[nums.length - 1]! };
        out.push(last);
        continue;
      }
    }
    // a wrapped narration: belongs to the line above, unless it is page furniture
    if (last && !date && !/^(page\b|statement\b|opening balance|closing balance|total\b|date\b|narration\b|account\b|customer\b|branch\b)/i.test(line) && last.text.length < 300) {
      last.text = `${last.text} ${line}`.slice(0, 300);
    }
  }
  return out;
}
