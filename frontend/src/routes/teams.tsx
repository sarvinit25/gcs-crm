import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { PageHeader } from "../components/app-shell";
import { Modal } from "../components/modal";
import { TableSkeleton } from "../components/skeleton";

type Team = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  lead: { id: string; name: string } | null;
  members: { id: string; name: string; role: string }[];
};

type Person = { id: string; name: string; role: string; designation: string | null };

type Setting = { key: string; label: string; value: unknown };

// What each switch does, shown as "ON — …" / "OFF — …" under its name.
const SWITCHES: { key: string; title: string; on: string; off: string }[] = [
  {
    key: "teams.autoAssignCases",
    title: "Auto case assignment",
    on: "new leads from the website, chat and WhatsApp are given to the next advisor in turn (team members first).",
    off: "new leads from the website wait in the unassigned pool until a manager hands them out.",
  },
  {
    key: "teams.autoAssignFiles",
    title: "Auto file assignment",
    on: "a file raised from a lead goes to that lead's owner.",
    off: "a file goes to whoever raised it.",
  },
  {
    key: "teams.hideClosedLeads",
    title: "Hide closed leads",
    on: "Converted and Lost leads are hidden from the lead list. Filter by those statuses to see them.",
    off: "Converted and Lost leads stay in the lead list until they are archived.",
  },
  {
    key: "teams.routeToTeamLead",
    title: "Team routing",
    on: "leads from a sourcing partner go to the lead of the team their relationship manager works in.",
    off: "leads from a sourcing partner are not routed to a team lead.",
  },
];

function Switch({ on, busy, onChange, label }: { on: boolean; busy: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onChange}
      className={clsx(
        "relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-60",
        on ? "bg-navy" : "bg-line",
      )}
    >
      <span
        className={clsx(
          "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
          on && "translate-x-5",
        )}
      />
    </button>
  );
}

export function TeamsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  // `null` = closed, `"new"` = adding, otherwise the team being edited.
  const [form, setForm] = useState<Team | "new" | null>(null);

  const teams = useQuery({ queryKey: ["teams"], queryFn: () => api<Team[]>("/teams") });
  const people = useQuery({ queryKey: ["team-assignable"], queryFn: () => api<Person[]>("/team/assignable") });
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ settings: Setting[] }>("/settings"),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["teams"] });

  const flip = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) =>
      api(`/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });

  const save = useMutation({
    mutationFn: ({ id, ...body }: { id?: string } & Record<string, unknown>) =>
      id
        ? api(`/teams/${id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api("/teams", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setForm(null);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: (t: Team) => api(`/teams/${t.id}`, { method: "PATCH", body: JSON.stringify({ active: !t.active }) }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/teams/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const needle = search.trim().toLowerCase();
  const rows = (teams.data ?? []).filter(
    (t) =>
      !needle ||
      t.name.toLowerCase().includes(needle) ||
      t.lead?.name.toLowerCase().includes(needle) ||
      t.members.some((m) => m.name.toLowerCase().includes(needle)),
  );
  const rowError = [toggle, remove, flip].find((m) => m.isError)?.error as Error | undefined;
  const valueOf = (key: string) => Boolean(settings.data?.settings.find((s) => s.key === key)?.value);

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle="Who works together and who leads them — and how new leads and files are handed out"
        actions={
          <button onClick={() => setForm("new")} className="btn-primary">
            <Plus className="h-4 w-4" /> Add team
          </button>
        }
      />

      <div className="space-y-5 px-6 py-5">
        {rowError && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{rowError.message}</p>
        )}

        <div className="card divide-y divide-line/70 px-5">
          {SWITCHES.map((s) => {
            const on = valueOf(s.key);
            return (
              <div key={s.key} className="flex items-center justify-between gap-4 py-3.5">
                <div>
                  <p className="text-[13px] font-semibold text-navy">{s.title}</p>
                  <p className="text-[12px] text-muted">
                    <span className={clsx("font-bold", on ? "text-emerald-700" : "text-muted")}>{on ? "ON" : "OFF"}</span>{" "}
                    — {on ? s.on : s.off}
                  </p>
                </div>
                <Switch
                  on={on}
                  busy={flip.isPending || settings.isPending}
                  label={s.title}
                  onChange={() => flip.mutate({ key: s.key, value: !on })}
                />
              </div>
            );
          })}
        </div>

        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-navy">Teams list</h2>
            <label className="relative block w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search teams…"
                className="field w-full pl-9"
              />
            </label>
          </div>

          <div className="card overflow-x-auto">
            {teams.isPending ? (
              <TableSkeleton />
            ) : !rows.length ? (
              <p className="py-16 text-center text-sm text-muted">
                {needle ? "No team matches your search." : "No teams yet. Add one to group your advisors."}
              </p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-line bg-bg-light/60 text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Name</th>
                    <th className="px-4 py-2.5 font-bold">Team lead</th>
                    <th className="px-4 py-2.5 font-bold">Members</th>
                    <th className="px-4 py-2.5 font-bold">Status</th>
                    <th className="px-4 py-2.5 font-bold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="border-b border-line/70 last:border-0">
                      <td className="px-4 py-3">
                        <p className={clsx("font-semibold text-navy", !t.active && "opacity-50")}>{t.name}</p>
                        {t.description && <p className="text-[12px] text-muted">{t.description}</p>}
                      </td>
                      <td className="px-4 py-3 text-navy">{t.lead?.name ?? <span className="text-muted">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className="text-muted" title={t.members.map((m) => m.name).join(", ")}>
                          {t.members.length} {t.members.length === 1 ? "member" : "members"}
                          {t.members.length > 0 && (
                            <span className="ml-2 text-[12px]">
                              {t.members.slice(0, 3).map((m) => m.name.split(" ")[0]).join(", ")}
                              {t.members.length > 3 && ` +${t.members.length - 3}`}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggle.mutate(t)}
                          disabled={toggle.isPending}
                          title={t.active ? "Click to switch off" : "Click to switch on"}
                          className={clsx(
                            "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                            t.active ? "bg-green-50 text-green-700" : "bg-bg-light text-muted",
                          )}
                        >
                          {t.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setForm(t)}
                            className="rounded p-1.5 text-muted transition hover:bg-bg-light hover:text-navy"
                            title="Edit"
                            aria-label={`Edit ${t.name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() =>
                              window.confirm(`Delete the team "${t.name}"? Its members stay on staff, just without a team.`) &&
                              remove.mutate(t.id)
                            }
                            className="rounded p-1.5 text-muted transition hover:bg-red-50 hover:text-red-600"
                            title="Delete"
                            aria-label={`Delete ${t.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {!teams.isPending && <p className="mt-2 text-[12px] text-muted">{teams.data?.length ?? 0} total</p>}
        </div>
      </div>

      {form && (
        <TeamForm
          team={form === "new" ? null : form}
          people={people.data ?? []}
          teams={teams.data ?? []}
          saving={save.isPending}
          error={save.isError ? (save.error as Error).message : null}
          onClose={() => {
            save.reset();
            setForm(null);
          }}
          onSave={(body) => save.mutate({ id: form === "new" ? undefined : form.id, ...body })}
        />
      )}
    </>
  );
}

function TeamForm({
  team,
  people,
  teams,
  saving,
  error,
  onClose,
  onSave,
}: {
  team: Team | null;
  people: Person[];
  teams: Team[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const [leadId, setLeadId] = useState(team?.lead?.id ?? "");
  const [members, setMembers] = useState<string[]>(team?.members.map((m) => m.id) ?? []);

  // Which team each person is in now, so picking someone from another team says so.
  const teamOf = new Map(teams.flatMap((t) => t.members.map((m) => [m.id, t] as const)));
  const picked = new Set([...members, ...(leadId ? [leadId] : [])]);

  const toggleMember = (id: string) =>
    setMembers((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));

  return (
    <Modal title={team ? "Edit team" : "Add team"} onClose={onClose} maxWidth="max-w-xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSave({
            name: String(f.get("name")).trim(),
            description: String(f.get("description")).trim() || null,
            leadId: leadId || null,
            memberIds: [...picked],
          });
        }}
        className="grid gap-3"
      >
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Name <span className="sr-only">(required)</span>
          <input
            name="name"
            required
            minLength={2}
            maxLength={60}
            defaultValue={team?.name}
            placeholder="e.g. Mumbai Sales"
            className="field font-normal"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Description
          <input
            name="description"
            maxLength={200}
            defaultValue={team?.description ?? ""}
            placeholder="Optional"
            className="field font-normal"
          />
        </label>
        <label className="grid content-start gap-1 text-[12px] font-semibold text-navy">
          Team lead
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="field font-normal">
            <option value="">No team lead yet</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.designation ? ` — ${p.designation}` : ""}
              </option>
            ))}
          </select>
        </label>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-navy">
            Members <span className="font-normal text-muted">({picked.size} selected, the lead counts as a member)</span>
          </p>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {people.map((p) => {
              const on = picked.has(p.id);
              const elsewhere = teamOf.get(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  disabled={p.id === leadId}
                  onClick={() => toggleMember(p.id)}
                  title={elsewhere && elsewhere.id !== team?.id ? `Now in ${elsewhere.name} — picking them moves them here` : undefined}
                  className={clsx(
                    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12px] font-semibold transition",
                    on ? "border-navy bg-navy text-white" : "border-line bg-white text-muted hover:text-navy",
                    elsewhere && elsewhere.id !== team?.id && !on && "border-dashed",
                  )}
                >
                  {p.id === leadId && <Crown className="h-3 w-3" />}
                  {p.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            A person works in one team. A dashed outline means they are in another team now; picking them moves them here.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
