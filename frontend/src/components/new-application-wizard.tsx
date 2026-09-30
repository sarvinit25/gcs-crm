import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { Modal } from "./modal";
import {
  CONSTITUTION_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  type ApplicantConstitution,
  type EmploymentType,
  type Lender,
} from "../lib/types";

type Product = { id: string; name: string; slug: string };
type Assignable = { id: string; name: string };

const EMPLOYMENT_TYPES = Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[];
const CONSTITUTIONS = Object.keys(CONSTITUTION_LABEL) as ApplicantConstitution[];

const STEPS = ["Applicant Details", "Co-Applicant", "Loan & Property", "References"];

/** One applicant's fields, reused for both primary and co-applicant with a field-name prefix. */
function ApplicantFields({
  prefix,
  defaults,
}: {
  prefix: string;
  defaults?: { name?: string; phone?: string; email?: string; city?: string };
}) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <input
        name={`${prefix}Name`}
        required={prefix === ""}
        defaultValue={defaults?.name}
        placeholder="Full name"
        className="field sm:col-span-2"
      />
      <input name={`${prefix}Phone`} defaultValue={defaults?.phone} placeholder="10-digit phone" className="field" />
      <input name={`${prefix}Email`} type="email" defaultValue={defaults?.email} placeholder="Email" className="field" />
      <input name={`${prefix}Pan`} placeholder="PAN" className="field uppercase" />
      <input name={`${prefix}AadhaarLast4`} placeholder="Aadhaar (last 4)" maxLength={4} className="field" />
      <input name={`${prefix}Address`} placeholder="Address" className="field sm:col-span-2" />
      <input name={`${prefix}City`} defaultValue={defaults?.city} placeholder="City" className="field" />
      <input name={`${prefix}Pincode`} placeholder="Pincode" className="field" />
      <select name={`${prefix}EmploymentType`} defaultValue="" className="field">
        <option value="">Employment type</option>
        {EMPLOYMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {EMPLOYMENT_TYPE_LABEL[t]}
          </option>
        ))}
      </select>
      <select name={`${prefix}Constitution`} defaultValue="" className="field">
        <option value="">Business constitution (if self-employed)</option>
        {CONSTITUTIONS.map((c) => (
          <option key={c} value={c}>
            {CONSTITUTION_LABEL[c]}
          </option>
        ))}
      </select>
      <input name={`${prefix}EmployerName`} placeholder="Employer / business name" className="field" />
      <input name={`${prefix}MonthlyIncome`} type="number" placeholder="Monthly income" className="field" />
      <input name={`${prefix}CibilScore`} type="number" placeholder="CIBIL score" className="field" />
      <label className="flex items-center gap-2 text-[13px] text-muted">
        <input name={`${prefix}IsNRI`} type="checkbox" className="h-4 w-4" />
        NRI
      </label>
    </div>
  );
}

function num(f: FormData, name: string) {
  const v = f.get(name);
  return v ? Number(v) : undefined;
}
function str(f: FormData, name: string) {
  return (f.get(name) as string) || undefined;
}

function applicantFromForm(f: FormData, prefix: string, isPrimary: boolean) {
  const name = str(f, `${prefix}Name`);
  if (!isPrimary && !name) return null; // co-applicant is optional — skip if left blank
  return {
    isPrimary,
    name: name ?? "",
    phone: str(f, `${prefix}Phone`),
    email: str(f, `${prefix}Email`),
    pan: str(f, `${prefix}Pan`)?.toUpperCase(),
    aadhaarLast4: str(f, `${prefix}AadhaarLast4`),
    address: str(f, `${prefix}Address`),
    city: str(f, `${prefix}City`),
    pincode: str(f, `${prefix}Pincode`),
    employmentType: str(f, `${prefix}EmploymentType`),
    constitution: str(f, `${prefix}Constitution`),
    employerName: str(f, `${prefix}EmployerName`),
    monthlyIncome: num(f, `${prefix}MonthlyIncome`),
    cibilScore: num(f, `${prefix}CibilScore`),
    isNRI: f.get(`${prefix}IsNRI`) === "on",
    ...(prefix !== "" && { relation: str(f, `${prefix}Relation`) }),
  };
}

function referenceFromForm(f: FormData, prefix: string) {
  const name = str(f, `${prefix}Name`);
  if (!name) return null;
  return {
    name,
    phone: str(f, `${prefix}Phone`) ?? "",
    relation: str(f, `${prefix}Relation`),
    address: str(f, `${prefix}Address`),
  };
}

export function NewApplicationWizard({
  leadId,
  prefill,
  onClose,
  onCreated,
}: {
  leadId?: string;
  prefill?: {
    name?: string;
    phone?: string;
    email?: string;
    city?: string;
    loanProductId?: string;
    requestedAmount?: string | number;
  };
  onClose: () => void;
  onCreated: (applicationId: string) => void;
}) {
  const [step, setStep] = useState(0);

  const products = useQuery({
    queryKey: ["loan-products"],
    queryFn: () => api<Product[]>("/loan-products"),
  });
  const lenders = useQuery({ queryKey: ["lenders"], queryFn: () => api<Lender[]>("/lenders") });
  const staff = useQuery({
    queryKey: ["team-assignable"],
    queryFn: () => api<Assignable[]>("/team/assignable"),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ id: string }>("/applications", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (app) => onCreated(app.id),
  });

  const isLast = step === STEPS.length - 1;

  return (
    <Modal
      title="New Application"
      subtitle="Walk through applicant, loan and reference details"
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {/* One step indicator, clickable to jump back to an already-visited step. */}
      <div className="relative mb-6 flex items-center justify-between">
        <span aria-hidden className="absolute top-4 right-4 left-4 h-0.5 -translate-y-1/2 bg-line" />
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i <= step && setStep(i)}
            className="group relative z-10 flex flex-col items-center gap-1.5"
          >
            <span
              className={clsx(
                "grid h-8 w-8 place-items-center rounded-full border-2 text-[12px] font-bold transition",
                i === step
                  ? "border-gold bg-gold text-navy"
                  : i < step
                    ? "border-gold/60 bg-white text-gold-dark"
                    : "border-line bg-white text-muted",
              )}
            >
              {i + 1}
            </span>
            <span
              className={clsx(
                "hidden text-[11px] font-semibold sm:block",
                i === step ? "text-navy" : "text-muted",
              )}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const primary = applicantFromForm(f, "", true);
          const coApplicant = applicantFromForm(f, "coApplicant", false);
          const reference1 = referenceFromForm(f, "reference1");
          const reference2 = referenceFromForm(f, "reference2");

          create.mutate({
            leadId,
            loanProductId: f.get("loanProductId"),
            requestedAmount: Number(f.get("requestedAmount")),
            tenureMonths: num(f, "tenureMonths"),
            purpose: str(f, "purpose"),
            lenderId: str(f, "lenderId"),
            ownerId: str(f, "ownerId"),
            applicants: [primary, coApplicant].filter(Boolean),
            references: [reference1, reference2].filter(Boolean),
          });
        }}
      >
        {create.isError && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700">
            {(create.error as Error).message}
          </p>
        )}

        {/* Step 1: kept mounted-but-hidden across steps (not unmounted) so values survive navigation. */}
        <div className={step === 0 ? "" : "hidden"}>
          <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
            Primary Applicant
          </p>
          <ApplicantFields prefix="" defaults={prefill} />
        </div>

        <div className={step === 1 ? "" : "hidden"}>
          <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
            Co-Applicant (optional)
          </p>
          <input
            name="coApplicantRelation"
            placeholder="Relation to primary applicant (e.g. Spouse, Father)"
            className="field mb-2.5"
          />
          <ApplicantFields prefix="coApplicant" />
        </div>

        <div className={step === 2 ? "" : "hidden"}>
          <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
            Loan &amp; Property
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <select
              name="loanProductId"
              required={step === 2}
              defaultValue={prefill?.loanProductId ?? ""}
              className="field sm:col-span-2"
            >
              <option value="" disabled>
                Select loan product
              </option>
              {products.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              name="requestedAmount"
              type="number"
              required
              min={1}
              defaultValue={prefill?.requestedAmount}
              placeholder="Requested amount"
              className="field"
            />
            <input name="tenureMonths" type="number" placeholder="Tenure (months)" className="field" />
            <select name="lenderId" defaultValue="" className="field">
              <option value="">Lender (optional)</option>
              {lenders.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.type})
                </option>
              ))}
            </select>
            <select name="ownerId" defaultValue="" className="field">
              <option value="">Owner (optional)</option>
              {staff.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <textarea
              name="purpose"
              placeholder="Purpose / property details (e.g. Purchase of flat in Thane)"
              className="field min-h-[70px] resize-none sm:col-span-2"
            />
          </div>
        </div>

        <div className={step === 3 ? "" : "hidden"}>
          <p className="mb-2 text-[11px] font-bold tracking-wide text-muted uppercase">
            References (optional)
          </p>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-2">
                <input name={`reference${i}Name`} placeholder={`Reference ${i} name`} className="field" />
                <input name={`reference${i}Phone`} placeholder="Phone" className="field" />
                <input name={`reference${i}Relation`} placeholder="Relation" className="field" />
                <input name={`reference${i}Address`} placeholder="Address" className="field" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="btn-ghost disabled:invisible"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {isLast ? (
            <button type="submit" disabled={create.isPending} className="btn-primary">
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Application
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="btn-primary"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
