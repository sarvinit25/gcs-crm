import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Scrolls to (and briefly highlights) the element a link points at, e.g.
 * /applications/abc#disbursement. Pages load their data after mounting, so the
 * target may not exist yet — keep looking for a few seconds before giving up.
 */
export function useScrollToHash() {
  const { pathname, hash } = useRouterState({ select: (s) => ({ pathname: s.location.pathname, hash: s.location.hash }) });

  useEffect(() => {
    if (!hash) return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(decodeURIComponent(hash));
      if (el) {
        clearInterval(timer);
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("flash-target");
        setTimeout(() => el.classList.remove("flash-target"), 2400);
      } else if (++tries > 40) {
        clearInterval(timer);
      }
    }, 100);
    return () => clearInterval(timer);
  }, [pathname, hash]);
}
