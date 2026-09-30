import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CornerDownLeft, Loader2, Search } from "lucide-react";
import { HitRow, useOpenHit, useSearchQuery, type SearchHit } from "./search-results";

export function GlobalSearch() {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const openHit = useOpenHit();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    setText("");
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 200);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    // "/" or Ctrl/⌘+K from anywhere jumps to the search box.
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const query = useSearchQuery(term, 5);
  const enabled = term.length >= 2;
  const groups = query.data?.groups ?? [];
  const flat = useMemo(() => groups.flatMap((g) => g.hits.map((hit) => ({ hit, group: g }))), [groups]);

  useEffect(() => setActive(0), [term]);

  const seeAll = () => {
    if (!term) return;
    setOpen(false);
    void navigate({ to: "/search" as never, search: { q: term } as never });
  };
  const go = (hit: SearchHit) => {
    setOpen(false);
    setText("");
    openHit(hit);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active] && !e.shiftKey) go(flat[active].hit);
      else seeAll();
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  let index = -1;
  return (
    <div ref={boxRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search anything — name, phone, bank ref, lender, setting…"
        className="field w-full rounded-full pr-16 pl-9"
        aria-label="Search the CRM"
        role="combobox"
        aria-expanded={open}
      />
      {query.isFetching && enabled ? (
        <Loader2 className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
      ) : (
        <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-line bg-bg-light px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">
          /
        </kbd>
      )}

      {open && text.trim().length > 0 && (
        <div
          role="listbox"
          className="card pop-enter absolute top-full right-0 left-0 z-40 mt-1.5 max-h-[70vh] overflow-y-auto p-1.5 shadow-lg"
        >
          {!enabled ? (
            <p className="px-3 py-4 text-center text-[13px] text-muted">Keep typing — at least 2 characters.</p>
          ) : query.isError ? (
            <p className="px-3 py-4 text-center text-[13px] text-red-600">
              Search failed: {(query.error as Error).message}
            </p>
          ) : query.isPending ? (
            <p className="px-3 py-4 text-center text-[13px] text-muted">Searching…</p>
          ) : groups.length === 0 ? (
            <div className="px-3 py-5 text-center">
              <p className="text-[13px] font-semibold text-navy">No matches for “{term}”</p>
              <p className="mt-1 text-[12px] text-muted">
                Try a name, phone number, application or bank reference number, lender, or a setting name.
              </p>
            </div>
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.type} className="mb-1">
                  <p className="flex items-center justify-between px-2.5 pt-1.5 pb-1 text-[10px] font-bold tracking-wide text-muted uppercase">
                    <span>{g.label}</span>
                    <span>{g.total > g.hits.length ? `${g.hits.length} of ${g.total}` : g.total}</span>
                  </p>
                  {g.hits.map((hit) => {
                    index += 1;
                    const i = index;
                    return (
                      <HitRow
                        key={`${g.type}-${hit.id}`}
                        hit={hit}
                        group={g}
                        query={term}
                        active={i === active}
                        onHover={() => setActive(i)}
                        onOpen={() => go(hit)}
                      />
                    );
                  })}
                </div>
              ))}
              <button
                type="button"
                onClick={seeAll}
                className="mt-1 flex w-full items-center justify-between rounded-md border-t border-line px-3 py-2 text-[12px] font-semibold text-navy hover:bg-bg-light"
              >
                <span>See all {query.data?.total} results for “{term}”</span>
                <span className="flex items-center gap-1 text-muted">
                  <CornerDownLeft className="h-3 w-3" /> shift+enter
                </span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
