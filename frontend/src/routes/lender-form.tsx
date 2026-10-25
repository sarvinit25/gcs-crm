import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { PageHeader } from "../components/app-shell";

type LenderFull = {
  id: string;
  name: string;
  shortName: string | null;
  type: "BANK" | "NBFC";
  logoUrl: string | null;
  isPublic: boolean;
  active: boolean;
  brokerCode: string | null;
  defaultCommission: string | null;
  portalUrl: string | null;
  branchName: string | null;
  branchCity: string | null;
  branchAddress: string | null;
  notes: string | null;
};

const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-bold text-navy">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid content-start gap-1 text-[12px] font-semibold text-navy ${className ?? ""}`}>
      {label}
      {children}
      {hint && <span className="text-[11px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

/** Add a lender, or edit one. Contacts and loan types are kept on the lender's own page. */
export function LenderFormPage() {
  const { lenderId } = useParams({ strict: false }) as { lenderId?: string };
  const editing = Boolean(lenderId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["lender", lenderId],
    queryFn: () => api<LenderFull>(`/lenders/${lenderId}`),
    enabled: editing,
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? api<LenderFull>(`/lenders/${lenderId}`, { method: "PATCH", body: JSON.stringify(body) })
        : api<LenderFull>("/lenders", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (l) => {
      void queryClient.invalidateQueries({ queryKey: ["lenders-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["lenders"] });
      void queryClient.invalidateQueries({ queryKey: ["lender"] });
      void navigate({ to: "/lenders/$lenderId", params: { lenderId: l.id } });
    },
  });

  const l = query.data;
  const loading = editing && query.isPending;

  return (
    <>
      <PageHeader
        title={editing ? "Edit lender" : "Add lender"}
        subtitle={editing ? l?.name : "A partner bank or NBFC"}
        actions={
          <Link to={editing && lenderId ? "/lenders/$lenderId" : "/lenders"} params={editing && lenderId ? { lenderId } : undefined} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />

      <div className="px-6 py-5">
        {query.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(query.error as Error).message}</p>}
        {loading && (
          <p className="flex items-center gap-2 py-12 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        )}

        {!loading && !query.isError && (
          <form
            key={l?.id ?? "new"}
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const commission = text(f, "defaultCommission");
              save.mutate({
                name: text(f, "name"),
                shortName: text(f, "shortName") || null,
                type: text(f, "type"),
                logoUrl: text(f, "logoUrl") || undefined,
                isPublic: f.get("isPublic") === "on",
                brokerCode: text(f, "brokerCode") || null,
                defaultCommission: commission ? Number(commission) : null,
                portalUrl: text(f, "portalUrl") || null,
                branchName: text(f, "branchName") || null,
                branchCity: text(f, "branchCity") || null,
                branchAddress: text(f, "branchAddress") || null,
                notes: text(f, "notes") || null,
              });
            }}
            className="space-y-5"
          >
            {save.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(save.error as Error).message}</p>}

            <Section title="Basic information">
              <Field label="Lender name" className="sm:col-span-2">
                <input name="name" required minLength={2} maxLength={120} defaultValue={l?.name} placeholder="Enter lender name" className="field font-normal" />
              </Field>
              <Field label="Type">
                <select name="type" defaultValue={l?.type ?? "BANK"} className="field font-normal">
                  <option value="BANK">Bank</option>
                  <option value="NBFC">NBFC</option>
                </select>
              </Field>
              <Field label="Short name" hint="How the team says it, e.g. HDFC.">
                <input name="shortName" maxLength={40} defaultValue={l?.shortName ?? ""} placeholder="e.g. HDFC" className="field font-normal" />
              </Field>
              <Field label="Logo path" hint="A file under the website's /public, e.g. /banks/hdfc-bank.svg." className="sm:col-span-2">
                <input name="logoUrl" maxLength={300} defaultValue={l?.logoUrl ?? ""} placeholder="/banks/logo.svg" className="field font-normal" />
              </Field>
              <label className="flex items-center gap-2 text-[13px] font-semibold text-navy sm:col-span-3">
                <input name="isPublic" type="checkbox" defaultChecked={l?.isPublic ?? true} />
                Show on the website's partner list
              </label>
            </Section>

            <Section title="Partnership details">
              <Field label="Broker code">
                <input name="brokerCode" maxLength={60} defaultValue={l?.brokerCode ?? ""} placeholder="Enter broker code" className="field font-normal" />
              </Field>
              <Field label="Default commission %" hint="What we usually earn from this lender. Each loan type can set its own.">
                <input name="defaultCommission" type="number" min={0} max={100} step="0.01" defaultValue={l?.defaultCommission ? Number(l.defaultCommission) : ""} placeholder="e.g. 1.5" className="field font-normal" />
              </Field>
              <Field label="Partner portal link">
                <input name="portalUrl" type="url" maxLength={300} defaultValue={l?.portalUrl ?? ""} placeholder="https://portal.bank.com" className="field font-normal" />
              </Field>
            </Section>

            <Section title="Branch details">
              <Field label="Branch name">
                <input name="branchName" maxLength={120} defaultValue={l?.branchName ?? ""} placeholder="Enter branch name" className="field font-normal" />
              </Field>
              <Field label="Branch city">
                <input name="branchCity" maxLength={80} defaultValue={l?.branchCity ?? ""} placeholder="Enter city" className="field font-normal" />
              </Field>
              <Field label="Branch address">
                <input name="branchAddress" maxLength={300} defaultValue={l?.branchAddress ?? ""} placeholder="Enter address" className="field font-normal" />
              </Field>
              <Field label="Notes" className="sm:col-span-3">
                <textarea name="notes" rows={3} maxLength={1000} defaultValue={l?.notes ?? ""} placeholder="Any additional notes…" className="field font-normal" />
              </Field>
            </Section>

            <p className="text-[12px] text-muted">
              Relationship managers and the loan types this lender offers are added on the lender's page, after it is saved.
            </p>

            <div className="flex justify-end gap-2">
              <Link to={editing && lenderId ? "/lenders/$lenderId" : "/lenders"} params={editing && lenderId ? { lenderId } : undefined} className="btn-ghost">
                Cancel
              </Link>
              <button type="submit" disabled={save.isPending} className="btn-primary">
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? "Save changes" : "Save lender"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
