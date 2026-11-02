import clsx from "clsx";

/** An on/off control that reads as one to a screen reader too. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-emerald-500" : "bg-slate-300",
      )}
    >
      <span className={clsx("inline-block h-5 w-5 rounded-full bg-white shadow transition", checked ? "translate-x-[1.375rem]" : "translate-x-0.5")} />
    </button>
  );
}
