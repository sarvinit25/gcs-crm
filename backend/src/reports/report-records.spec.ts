import { PayoutStatus } from "@prisma/client";
import { collect, rollUpPayout } from "./report-records.service";

/** A fake table of ids, paged the way Prisma does it with a cursor. */
const table = (n: number) => {
  const all = Array.from({ length: n }, (_, i) => ({ id: `r${String(i).padStart(4, "0")}` }));
  const calls: number[] = [];
  const page = async ({ take, cursor, skip }: { take: number; cursor?: { id: string }; skip?: number }) => {
    calls.push(take);
    const start = cursor ? all.findIndex((r) => r.id === cursor.id) + (skip ?? 0) : 0;
    return all.slice(start, start + take);
  };
  return { all, page, calls };
};

describe("collect (uncapped, batched reads)", () => {
  it("returns every record when there is no limit, however many batches it takes", async () => {
    const t = table(1234);
    const { rows, more } = await collect(t.page, null, 100);
    expect(rows).toHaveLength(1234);
    expect(rows.map((r) => r.id)).toEqual(t.all.map((r) => r.id));
    expect(more).toBe(false);
    expect(t.calls.length).toBe(13);
  });

  it("handles an exact multiple of the batch size and an empty table", async () => {
    expect((await collect(table(300).page, null, 100)).rows).toHaveLength(300);
    expect((await collect(table(0).page, null, 100)).rows).toEqual([]);
  });

  it("with a limit, stops there and says whether more exist", async () => {
    const t = table(50);
    const cut = await collect(t.page, 20, 8);
    expect(cut.rows).toHaveLength(20);
    expect(cut.more).toBe(true);
    const exact = await collect(table(20).page, 20, 8);
    expect(exact.rows).toHaveLength(20);
    expect(exact.more).toBe(false);
  });
});

describe("rollUpPayout", () => {
  it("summarises a file's commissions in one status", () => {
    const { PENDING, CLAIMED, PARTIAL, PAID } = PayoutStatus;
    expect(rollUpPayout([])).toBeNull();
    expect(rollUpPayout([PAID, PAID])).toBe(PAID);
    expect(rollUpPayout([PAID, PENDING])).toBe(PARTIAL);
    expect(rollUpPayout([PARTIAL, CLAIMED])).toBe(PARTIAL);
    expect(rollUpPayout([CLAIMED, PENDING])).toBe(CLAIMED);
    expect(rollUpPayout([PENDING])).toBe(PENDING);
  });
});
