import { describe, expect, it } from "vitest";
import { parseCsv, toRows } from "./lead-import-modal";

describe("lead import CSV", () => {
  it("reads quoted commas, doubled quotes and Windows line endings", () => {
    const rows = parseCsv('name,notes\r\n"Patil, Asha","said ""hi"""\r\nRavi,plain\r\n');
    expect(rows).toEqual([
      ["name", "notes"],
      ["Patil, Asha", 'said "hi"'],
      ["Ravi", "plain"],
    ]);
  });

  it("maps columns by header and cleans the amount", () => {
    const { rows, error } = toRows("Name,Phone,Amount\nAsha,9876500001,\"₹45,00,000\"\n");
    expect(error).toBeUndefined();
    expect(rows[0]).toMatchObject({ name: "Asha", phone: "9876500001", amount: 4500000 });
  });

  it("rejects a file without the required columns", () => {
    expect(toRows("email\na@b.in\n").error).toMatch(/name.*phone/);
    expect(toRows("name,phone\n").error).toMatch(/no data rows/);
  });

  it("ignores a leading byte-order mark", () => {
    expect(parseCsv("﻿name,phone\nA,1\n")[0]).toEqual(["name", "phone"]);
  });
});
