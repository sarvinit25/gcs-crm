/**
 * Keeps a grid of cards level: when the last row would be short, the final card stretches across the empty
 * columns instead of leaving a gap (7 report cards in 4 columns → the last one takes 2).
 */

export type Step = { at: "" | "sm:" | "md:" | "lg:" | "xl:"; cols: number };

/** How many columns the final item should span so the last row is full. */
export function lastSpan(count: number, cols: number): number {
  if (cols <= 1 || count <= 0) return 1;
  const rest = count % cols;
  return rest === 0 ? 1 : cols - rest + 1;
}

// Written out in full so Tailwind can see every class name.
const SPAN: Record<Step["at"], Record<number, string>> = {
  "": { 1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 5: "col-span-5" },
  "sm:": { 1: "sm:col-span-1", 2: "sm:col-span-2", 3: "sm:col-span-3", 4: "sm:col-span-4", 5: "sm:col-span-5" },
  "md:": { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4", 5: "md:col-span-5" },
  "lg:": { 1: "lg:col-span-1", 2: "lg:col-span-2", 3: "lg:col-span-3", 4: "lg:col-span-4", 5: "lg:col-span-5" },
  "xl:": { 1: "xl:col-span-1", 2: "xl:col-span-2", 3: "xl:col-span-3", 4: "xl:col-span-4", 5: "xl:col-span-5" },
};

/** Class names for the last card of `count`, given the grid's column count at each breakpoint (smallest first). */
export function fillLast(count: number, steps: Step[]): string {
  return steps.map((s) => SPAN[s.at][lastSpan(count, s.cols)]).join(" ");
}
