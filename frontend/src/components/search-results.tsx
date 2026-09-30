import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Banknote,
  Building2,
  ClipboardList,
  FileText,
  Handshake,
  History,
  LayoutGrid,
  Settings as SettingsIcon,
  Users,
  UserSquare,
  type LucideIcon,
} from "lucide-react";
import { api, qs } from "../lib/api";

export type Match = { label: string; value: string; section?: string };
export type SearchHit = {
  id: string;
  title: string;
  subtitle: string;
  where: string;
  path: string;
  hash?: string;
  matches: Match[];
};
export type SearchGroup = { type: string; label: string; total: number; hits: SearchHit[] };
export type SearchResponse = { query: string; groups: SearchGroup[]; total: number };

export const GROUP_ICON: Record<string, LucideIcon> = {
  applications: FileText,
  leads: Users,
  lenders: Building2,
  partners: Handshake,
  team: UserSquare,
  products: ClipboardList,
  pages: LayoutGrid,
  audit: History,
  settings: SettingsIcon,
  disbursements: Banknote,
};

export function useSearchQuery(term: string, limit: number) {
  return useQuery({
    queryKey: ["search", term, limit],
    queryFn: () => api<SearchResponse>(`/search${qs({ q: term, limit })}`),
    enabled: term.length >= 2,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

/** Opens a hit — the page, and the exact section of it the match lives in. */
export function useOpenHit() {
  const navigate = useNavigate();
  return (hit: SearchHit) => void navigate({ to: hit.path as never, hash: hit.hash });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Bolds the searched words wherever they appear in a piece of text. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = query.split(/\s+/).filter((w) => w.length > 0);
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.map(escape).join("|")})`, "ig"));
  return (
    <>
      {parts.map((p, i) =>
        words.some((w) => w.toLowerCase() === p.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-gold-pale px-0.5 font-semibold text-navy">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function HitRow({
  hit,
  group,
  query,
  active,
  onOpen,
  onHover,
}: {
  hit: SearchHit;
  group: SearchGroup;
  query: string;
  active?: boolean;
  onOpen: () => void;
  onHover?: () => void;
}) {
  const Icon = GROUP_ICON[group.type] ?? FileText;
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onOpen}
      onMouseEnter={onHover}
      className={`flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition ${active ? "bg-bg-light" : "hover:bg-bg-light"}`}
    >
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-navy/8 text-navy">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-navy">
          <Highlight text={hit.title} query={query} />
        </span>
        <span className="block truncate text-[12px] text-muted">
          <Highlight text={hit.subtitle} query={query} />
        </span>
        {hit.matches.length > 0 && (
          <span className="mt-0.5 block truncate text-[11px] text-ink/80">
            {hit.matches.map((m, i) => (
              <span key={i} className="mr-2">
                <span className="text-muted">{m.label}:</span> <Highlight text={m.value} query={query} />
              </span>
            ))}
          </span>
        )}
        <span className="mt-0.5 block truncate text-[11px] font-semibold text-gold-dark">{hit.where}</span>
      </span>
    </button>
  );
}
