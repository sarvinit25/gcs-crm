import { useEffect, useRef, useState } from "react";
import { formatIndianNumber } from "../lib/format";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Eases a number from wherever it currently shows to its new value. */
export function useCountUp(target: number, duration = 700) {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (prefersReducedMotion() || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = origin + (target - origin) * eased;
      from.current = current;
      setValue(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return value;
}

/** A figure that counts up to its value — on first load, and again when a filter changes it. */
export function CountUp({
  value,
  format = (n) => formatIndianNumber(Math.round(n)),
}: {
  value: number;
  format?: (n: number) => string;
}) {
  // Start from zero the first time so the initial load animates too.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const shown = useCountUp(mounted ? value : 0);
  return <>{format(mounted ? shown : 0)}</>;
}
