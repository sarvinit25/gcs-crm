// A workbook written by code holds formulas but not their answers. Excel works them out when it opens the file; a phone or
// e-mail preview does not, and shows blank boxes. This works out the answers for the formulas our CAM uses and saves them
// beside each formula. A formula it cannot work out is simply left for Excel.

import type ExcelJS from "exceljs";

type Scalar = number | string | boolean | null;
type Value = Scalar | Scalar[];
class FormulaError extends Error {}

type Node = () => Value;

const TOKEN = /\s*(?:("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-z][A-Za-z0-9_]*)!)?(\$?[A-Z]{1,2}\$?\d+)(?::(\$?[A-Z]{1,2}\$?\d+))?|([A-Z][A-Z0-9.]*)\(|(\d+(?:\.\d+)?)|(TRUE|FALSE)|(<>|<=|>=|[-+*\/^&=<>(),]))/y;

const num = (v: Scalar): number => {
  if (v === null || v === "") return 0;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new FormulaError("not a number");
  return n;
};
const finite = (n: number) => {
  if (!Number.isFinite(n)) throw new FormulaError("division by zero or overflow");
  return n;
};
const one = (v: Value): Scalar => {
  if (Array.isArray(v)) return v.length ? v[0]! : null;
  return v;
};
const flat = (args: Value[]) => args.flatMap((a) => (Array.isArray(a) ? a : [a]));
const numbers = (args: Value[]) => flat(args).filter((v): v is number => typeof v === "number");
const compare = (a: Scalar, op: string, b: Scalar): boolean => {
  // A blank box equals both nothing and zero.
  const x = a === null ? (typeof b === "string" ? "" : 0) : a;
  const y = b === null ? (typeof a === "string" ? "" : 0) : b;
  const [p, q] = typeof x === "string" && typeof y === "string" ? [x.toLowerCase(), y.toLowerCase()] : [x, y];
  if (op === "=") return p === q;
  if (op === "<>") return p !== q;
  if (op === "<") return p < q;
  if (op === ">") return p > q;
  if (op === "<=") return p <= q;
  return p >= q;
};
const each = (a: Value, b: Value, f: (x: Scalar, y: Scalar) => Scalar): Value => {
  if (!Array.isArray(a) && !Array.isArray(b)) return f(a, b);
  const n = Math.max(Array.isArray(a) ? a.length : 1, Array.isArray(b) ? b.length : 1);
  return Array.from({ length: n }, (_, i) => f(Array.isArray(a) ? (a[i] ?? null) : a, Array.isArray(b) ? (b[i] ?? null) : b));
};
const annuity = (rate: number, n: number) => (rate === 0 ? n : (1 - Math.pow(1 + rate, -n)) / rate);

const FUNCTIONS: Record<string, (args: Node[]) => Value> = {
  IF: ([c, a, b]) => (num(one(c!())) ? (a ? a() : true) : b ? b() : false),
  IFERROR: ([a, b]) => {
    try {
      return a!();
    } catch (e) {
      if (e instanceof FormulaError) return b!();
      throw e;
    }
  },
  AND: (a) => flat(a.map((x) => x())).every((v) => num(v) !== 0),
  OR: (a) => flat(a.map((x) => x())).some((v) => num(v) !== 0),
  NOT: ([a]) => !num(one(a!())),
  N: ([a]) => {
    const v = one(a!());
    return typeof v === "number" ? v : v === true ? 1 : 0;
  },
  ISNUMBER: ([a]) => typeof one(a!()) === "number",
  SUM: (a) => numbers(a.map((x) => x())).reduce((s, n) => s + n, 0),
  MAX: (a) => Math.max(0, ...(numbers(a.map((x) => x())).length ? [Math.max(...numbers(a.map((x) => x())))] : [])),
  MIN: (a) => {
    const n = numbers(a.map((x) => x()));
    return n.length ? Math.min(...n) : 0;
  },
  AVERAGE: (a) => {
    const n = numbers(a.map((x) => x()));
    return finite(n.reduce((s, v) => s + v, 0) / n.length);
  },
  COUNT: (a) => numbers(a.map((x) => x())).length,
  COUNTIF: ([range, want]) => flat([range!()]).filter((v) => compare(v, "=", one(want!()))).length,
  SUMPRODUCT: ([a]) => flat([a!()]).reduce<number>((s, v) => s + num(v), 0),
  ABS: ([a]) => Math.abs(num(one(a!()))),
  ROUND: ([a, d]) => {
    const f = 10 ** num(one(d!()));
    return Math.round(num(one(a!())) * f) / f;
  },
  INDEX: ([range, at]) => {
    const v = flat([range!()])[num(one(at!())) - 1];
    if (v === undefined) throw new FormulaError("outside the range");
    return v;
  },
  MATCH: ([want, range]) => {
    const w = one(want!());
    const i = flat([range!()]).findIndex((v) => compare(v, "=", w));
    if (i < 0) throw new FormulaError("not found");
    return i + 1;
  },
  PMT: ([r, n, pv]) => finite(-num(one(pv!())) / annuity(num(one(r!())), num(one(n!())))),
  PV: ([r, n, pmt]) => finite(-num(one(pmt!())) * annuity(num(one(r!())), num(one(n!())))),
  TEXT: ([a]) => Math.round(num(one(a!()))).toLocaleString("en-IN"),
};

const column = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const address = (a: string) => {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(a)!;
  return { col: column(m[1]!), row: Number(m[2]) };
};

export function fillFormulaResults(wb: ExcelJS.Workbook): { worked: number; left: string[] } {
  const done = new Map<string, Scalar>();
  const busy = new Set<string>();

  const read = (ws: ExcelJS.Worksheet, row: number, col: number): Scalar => {
    const cell = ws.getRow(row).getCell(col);
    const v = cell.value as unknown;
    if (v === null || v === undefined) return null;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
    if (v instanceof Date) return v.getTime() / 86_400_000 + 25_569;
    if (typeof v === "object" && "formula" in (v as object)) return work(ws, cell);
    return String((v as { text?: string }).text ?? "");
  };

  const work = (ws: ExcelJS.Worksheet, cell: ExcelJS.Cell): Scalar => {
    const id = `${ws.name}!${cell.address}`;
    if (done.has(id)) return done.get(id)!;
    if (busy.has(id)) throw new FormulaError("circular");
    busy.add(id);
    try {
      const value = one(parse(ws, (cell.value as { formula: string }).formula)());
      done.set(id, value);
      return value;
    } finally {
      busy.delete(id);
    }
  };

  const parse = (ws: ExcelJS.Worksheet, formula: string): Node => {
    const tokens: RegExpExecArray[] = [];
    TOKEN.lastIndex = 0;
    while (TOKEN.lastIndex < formula.length) {
      const m = TOKEN.exec(formula);
      if (!m) throw new FormulaError(`cannot read ${formula}`);
      tokens.push(m);
    }
    let i = 0;
    const op = () => tokens[i]?.[8];
    const expect = (s: string) => {
      if (op() !== s) throw new FormulaError(`expected ${s} in ${formula}`);
      i++;
    };
    const level = (next: () => Node, ops: string[], f: (a: Scalar, o: string, b: Scalar) => Scalar) => (): Node => {
      let left = next();
      while (ops.includes(op() ?? "")) {
        const o = tokens[i++]![8]!;
        const right = next();
        const a = left;
        left = () => each(a(), right(), (x, y) => f(x, o, y));
      }
      return left;
    };
    const primary = (): Node => {
      const t = tokens[i++];
      if (!t) throw new FormulaError(`unfinished ${formula}`);
      if (t[1] !== undefined) {
        const s = t[1].slice(1, -1).replace(/""/g, '"');
        return () => s;
      }
      if (t[3] !== undefined) {
        const name = t[2]?.slice(0, -1).replace(/^'|'$/g, "");
        const sheet = name ? wb.getWorksheet(name) : ws;
        if (!sheet) throw new FormulaError(`no sheet ${name}`);
        const a = address(t[3]);
        if (t[4] === undefined) return () => read(sheet, a.row, a.col);
        const b = address(t[4]);
        return () => {
          const out: Scalar[] = [];
          for (let r = a.row; r <= b.row; r++) for (let c = a.col; c <= b.col; c++) out.push(read(sheet, r, c));
          return out;
        };
      }
      if (t[5] !== undefined) {
        const args: Node[] = [];
        while (op() !== ")") {
          args.push(expression());
          if (op() === ",") i++;
        }
        expect(")");
        const f = FUNCTIONS[t[5]];
        if (!f) throw new Error(`unknown function ${t[5]}`);
        return () => f(args);
      }
      if (t[6] !== undefined) {
        const n = Number(t[6]);
        return () => n;
      }
      if (t[7] !== undefined) return () => t[7] === "TRUE";
      if (t[8] === "(") {
        const inner = expression();
        expect(")");
        return inner;
      }
      if (t[8] === "-" || t[8] === "+") {
        const inner = primary();
        const sign = t[8] === "-" ? -1 : 1;
        return () => {
          const v = inner();
          return Array.isArray(v) ? v.map((x) => sign * num(x)) : sign * num(v);
        };
      }
      throw new FormulaError(`unexpected ${t[8]} in ${formula}`);
    };
    const power = level(primary, ["^"], (a, _, b) => finite(Math.pow(num(a), num(b))));
    const product = level(power, ["*", "/"], (a, o, b) => finite(o === "*" ? num(a) * num(b) : num(a) / num(b)));
    const sum = level(product, ["+", "-"], (a, o, b) => (o === "+" ? num(a) + num(b) : num(a) - num(b)));
    const join = level(sum, ["&"], (a, _, b) => `${a ?? ""}${b ?? ""}`);
    const expression: () => Node = level(join, ["=", "<>", "<", ">", "<=", ">="], (a, o, b) => compare(a, o, b));
    const root = expression();
    if (i !== tokens.length) throw new FormulaError(`left over in ${formula}`);
    return root;
  };

  let worked = 0;
  const left: string[] = [];
  for (const ws of wb.worksheets) {
    ws.eachRow((row) =>
      row.eachCell((cell) => {
        const v = cell.value as { formula?: string } | null;
        if (!v || typeof v !== "object" || !v.formula) return;
        try {
          const result = work(ws, cell);
          cell.value = { formula: v.formula, result: result ?? 0 } as ExcelJS.CellValue;
          worked++;
        } catch {
          left.push(`${ws.name}!${cell.address}`);
        }
      }),
    );
  }
  return { worked, left };
}
