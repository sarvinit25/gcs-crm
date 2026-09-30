import { useEffect, useState } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Loader2, Search } from "lucide-react";
import { PageHeader } from "../components/app-shell";
import { HitRow, useOpenHit, useSearchQuery } from "../components/search-results";

export function SearchPage() {
  const { q = "" } = useSearch({ strict: false }) as { q?: string };
  const navigate = useNavigate();
  const openHit = useOpenHit();
  const [text, setText] = useState(q);
  const term = q.trim();
  const query = useSearchQuery(term, 25);

  useEffect(() => setText(q), [q]);

  return (
    <>
      <PageHeader
        title="Search"
        subtitle={
          term.length >= 2 && query.data
            ? `${query.data.total} result${query.data.total === 1 ? "" : "s"} for “${term}”`
            : "Find anything across leads, applications, people, lenders and settings"
        }
      />
      <div className="px-6 py-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void navigate({ to: "/search" as never, search: { q: text.trim() } as never });
          }}
          className="relative mb-5 max-w-2xl"
        >
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted/60" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Name, phone, PAN, application no., bank reference, UTR, lender, setting…"
            className="field w-full pl-9"
          />
        </form>

        {term.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted">Type at least 2 characters to search.</p>
        ) : query.isPending ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </div>
        ) : query.isError ? (
          <p className="py-10 text-center text-sm text-red-600">{(query.error as Error).message}</p>
        ) : query.data.groups.length === 0 ? (
          <div className="card px-6 py-12 text-center">
            <p className="text-sm font-semibold text-navy">Nothing found for “{term}”</p>
            <p className="mt-1 text-[13px] text-muted">
              Try fewer words, a phone number, an application or bank reference number, or a setting name.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {query.data.groups.map((g) => (
              <section key={g.type} className="card p-3" role="listbox">
                <h2 className="px-2.5 pt-1 pb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
                  {g.label} <span className="text-navy">· {g.total}</span>
                  {g.total > g.hits.length && <span className="ml-2 font-normal normal-case">showing first {g.hits.length}</span>}
                </h2>
                {g.hits.map((hit) => (
                  <HitRow key={`${g.type}-${hit.id}`} hit={hit} group={g} query={term} onOpen={() => openHit(hit)} />
                ))}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
