import clsx from "clsx";

const asset = (file: string) => `${import.meta.env.BASE_URL}brand/${file}`;

/**
 * The G mark on a white tile. The mark is navy and gold, so on the navy headers
 * and sidebar it needs a light ground to stay readable.
 */
export function LogoMark({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const box = { sm: "h-8 w-8 p-1", md: "h-9 w-9 p-1", lg: "h-11 w-11 p-1.5" }[size];
  return (
    <span className={clsx("grid shrink-0 place-items-center rounded-lg bg-white shadow-sm", box, className)}>
      <img src={asset("gcs-mark.png")} alt="Growth Capital Services" className="h-full w-full object-contain" draggable={false} />
    </span>
  );
}

/** The full lockup (mark, name, tagline) — for the sign-in screens, which sit on white cards. */
export function LogoFull({ className }: { className?: string }) {
  return (
    <img
      src={asset("gcs-logo.png")}
      alt="Growth Capital Services — Your growth, our financial expertise"
      className={clsx("mx-auto h-44 w-auto max-w-full object-contain", className)}
      draggable={false}
    />
  );
}
