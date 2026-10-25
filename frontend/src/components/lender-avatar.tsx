import clsx from "clsx";
import { initials } from "../lib/format";

/** The lender's initials on a soft tile, in the colour of its type. */
export function LenderAvatar({ name, type, size = "sm" }: { name: string; type: "BANK" | "NBFC"; size?: "sm" | "lg" }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "grid shrink-0 place-items-center rounded-lg font-bold",
        size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-[12px]",
        type === "BANK" ? "bg-navy/10 text-navy" : "bg-gold-pale text-gold-dark",
      )}
    >
      {initials(name)}
    </span>
  );
}
