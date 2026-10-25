import { useQuery } from "@tanstack/react-query";
import { Landmark, Loader2, MapPin } from "lucide-react";
import { api } from "../lib/api";
import { Modal } from "./modal";

type Staff = { id: string; name: string };

/** What the roster row carries; the rest comes from the partner's own record when editing. */
type PartnerRow = { id: string; name: string };

type PartnerFull = {
  id: string;
  name: string;
  firm: string | null;
  phone: string;
  email: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  pincode: string | null;
  pan: string | null;
  gstin: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  accountHolder: string | null;
  notes: string | null;
  commissionRate: string;
  managerId: string | null;
  active: boolean;
  hasPortalAccess: boolean;
};

const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid content-start gap-1 text-[12px] font-semibold text-navy ${className ?? ""}`}>
      {label}
      {children}
      {hint && <span className="text-[11px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

function Heading({ icon: Icon, children }: { icon: typeof MapPin; children: string }) {
  return (
    <p className="mt-1 flex items-center gap-1.5 border-t border-line pt-3 text-[11px] font-bold tracking-wide text-muted uppercase sm:col-span-6">
      <Icon className="h-3.5 w-3.5" /> {children}
    </p>
  );
}

/** Add a sourcing partner, or edit one: who they are, where they are, and where their commission is paid. */
export function PartnerForm({
  partner,
  staff,
  saving,
  error,
  onClose,
  onSave,
}: {
  partner: PartnerRow | null;
  staff: Staff[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => void;
}) {
  const editing = Boolean(partner);
  const detail = useQuery({
    queryKey: ["partner", partner?.id],
    queryFn: () => api<PartnerFull>(`/partners/${partner!.id}`),
    enabled: editing,
    gcTime: 0,
  });
  const p = detail.data;
  const loading = editing && detail.isPending;

  return (
    <Modal
      title={editing ? `Edit ${partner!.name}` : "Add sourcing partner"}
      subtitle={editing ? "A rate change applies to cases referred from now on." : undefined}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {detail.isError && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">{(detail.error as Error).message}</p>}
      {loading && (
        <p className="flex items-center gap-2 py-10 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      )}

      {!loading && !detail.isError && (
        <form
          key={p?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            // Empty details go as null, which clears them; a new partner's blanks are simply not recorded.
            const detailsOrNull = Object.fromEntries(
              ["address", "state", "pincode", "pan", "gstin", "bankName", "accountNumber", "ifsc", "accountHolder", "notes"].map((k) => [k, text(f, k) || null]),
            );
            onSave({
              name: text(f, "name"),
              firm: text(f, "firm") || undefined,
              phone: text(f, "phone"),
              email: text(f, "email") || undefined,
              city: text(f, "city") || undefined,
              commissionRate: Number(f.get("commissionRate")),
              managerId: text(f, "managerId") || (editing ? "" : undefined),
              ...detailsOrNull,
              ...(editing ? { active: f.get("status") === "active" } : { password: text(f, "password") || undefined }),
            });
          }}
          className="grid gap-3 sm:grid-cols-6"
        >
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700 sm:col-span-6">{error}</p>}

          <Field label="Partner name" className="sm:col-span-3">
            <input name="name" required minLength={2} maxLength={120} defaultValue={p?.name} className="field font-normal" />
          </Field>
          <Field label="Firm" className="sm:col-span-3">
            <input name="firm" maxLength={160} defaultValue={p?.firm ?? ""} placeholder="Optional" className="field font-normal" />
          </Field>
          <Field label="Mobile" className="sm:col-span-2">
            <input name="phone" required pattern="[6-9][0-9]{9}" title="10-digit mobile number" defaultValue={p?.phone} placeholder="10-digit mobile" className="field font-normal" />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <input name="email" type="email" defaultValue={p?.email ?? ""} className="field font-normal" />
          </Field>
          <Field label="Default split %" hint="Their share of our commission." className="sm:col-span-2">
            <input name="commissionRate" type="number" step="0.01" min={0} max={100} required defaultValue={p?.commissionRate} className="field font-normal" />
          </Field>
          <Field label="Reports to" className="sm:col-span-3">
            <select name="managerId" defaultValue={p?.managerId ?? ""} className="field font-normal">
              <option value="">Nobody yet</option>
              {staff.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {editing ? (
            <Field label="Status" className="sm:col-span-3">
              <select name="status" defaultValue={p?.active ? "active" : "inactive"} className="field font-normal">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          ) : (
            <Field label="Portal password" hint="Optional — lets them sign in to the Partner Portal. Can be set later." className="sm:col-span-3">
              <input name="password" type="text" autoComplete="off" className="field font-normal" />
            </Field>
          )}

          <Heading icon={MapPin}>Address</Heading>
          <Field label="Address" className="sm:col-span-3">
            <input name="address" maxLength={300} defaultValue={p?.address ?? ""} className="field font-normal" />
          </Field>
          <Field label="City" className="sm:col-span-2">
            <input name="city" maxLength={80} defaultValue={p?.city ?? ""} className="field font-normal" />
          </Field>
          <Field label="State" className="sm:col-span-1">
            <input name="state" maxLength={80} defaultValue={p?.state ?? ""} className="field font-normal" />
          </Field>
          <Field label="Pincode" className="sm:col-span-2">
            <input name="pincode" inputMode="numeric" pattern="[0-9]{6}" title="6 digits" maxLength={6} defaultValue={p?.pincode ?? ""} className="field font-normal" />
          </Field>
          <Field label="PAN" className="sm:col-span-2">
            <input name="pan" maxLength={10} pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" title="Like ABCDE1234F" defaultValue={p?.pan ?? ""} className="field font-mono font-normal uppercase" />
          </Field>
          <Field label="GST" className="sm:col-span-2">
            <input name="gstin" maxLength={15} defaultValue={p?.gstin ?? ""} className="field font-mono font-normal uppercase" />
          </Field>

          <Heading icon={Landmark}>Bank details — where their commission is paid</Heading>
          <Field label="Bank name" className="sm:col-span-3">
            <input name="bankName" maxLength={120} defaultValue={p?.bankName ?? ""} className="field font-normal" />
          </Field>
          <Field label="Account number" className="sm:col-span-3">
            <input name="accountNumber" inputMode="numeric" pattern="[0-9]{6,18}" title="6 to 18 digits" maxLength={18} autoComplete="off" defaultValue={p?.accountNumber ?? ""} className="field font-mono font-normal" />
          </Field>
          <Field label="IFSC code" className="sm:col-span-3">
            <input name="ifsc" maxLength={11} pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" title="Like HDFC0001234" defaultValue={p?.ifsc ?? ""} className="field font-mono font-normal uppercase" />
          </Field>
          <Field label="Account holder" className="sm:col-span-3">
            <input name="accountHolder" maxLength={120} defaultValue={p?.accountHolder ?? ""} className="field font-normal" />
          </Field>

          <Field label="Notes" className="sm:col-span-6">
            <textarea name="notes" rows={2} maxLength={1000} defaultValue={p?.notes ?? ""} placeholder="Optional notes" className="field font-normal" />
          </Field>

          <div className="flex justify-end gap-2 sm:col-span-6">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save" : "Add partner"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
