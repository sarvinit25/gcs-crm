import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, FileText, Loader2, Lock, Phone, Plus, ShieldCheck, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { DatePicker } from "../components/date-picker";
import { FormApiError, formApi } from "../lib/public-form-api";
import { todayIST } from "../lib/date";
import { formatDate, formatIndianNumber } from "../lib/format";
import {
  STEPS, STEP_OF, fieldErrors, firstStepWithProblem, formatBytes, fromServer, isBusiness, tenureInWords, toPayload, yearsBefore,
  type FormValues, type ServerForm, type StepIndex,
} from "../lib/customer-form";
import { CONSTITUTION_LABEL, EMPLOYMENT_TYPE_LABEL, type ApplicantConstitution, type EmploymentType } from "../lib/types";

type Company = { name: string; phone: string; email: string };
type Closed = { state: "submitted" | "expired" | "closed"; company: Company; applicationNo: string; submittedAt?: string | null };
type Open = {
  state: "open";
  company: Company;
  applicationNo: string;
  expiresAt: string;
  product: string;
  phone: string | null;
  form: ServerForm;
  checklist: { label: string; category: string; received: boolean }[];
  categories: string[];
  documents: { id: string; category: string; fileName: string; sizeBytes: number }[];
  limits: { maxFileMb: number; maxFiles: number; referencesRequired: number };
};
type View = Open | Closed;

/** Shell shared by every state of the page: branded header, narrow centred column, nothing from the staff app. */
function Frame({ company, children }: { company?: Company; children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-bg-light">
      <header className="bg-navy px-4 py-4">
        <div className="mx-auto flex max-w-xl items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-gold font-bold text-navy">G</span>
          <div className="leading-tight text-white">
            <p className="font-bold">{company?.name ?? "Growth Capital Services"}</p>
            <p className="flex items-center gap-1 text-xs text-white/60">
              <Lock className="h-3 w-3" /> Secure application form
            </p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  );
}

function Contact({ company }: { company?: Company }) {
  if (!company?.phone && !company?.email) return null;
  return (
    <p className="mt-4 text-[13px] text-muted">
      Questions? {company.phone && <a className="font-semibold text-navy" href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>}
      {company.phone && company.email && " · "}
      {company.email && <a className="font-semibold text-navy" href={`mailto:${company.email}`}>{company.email}</a>}
    </p>
  );
}

function Message({ company, icon, title, children }: { company?: Company; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Frame company={company}>
      <div className="card dialog-enter p-6 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold-pale text-gold-dark">{icon}</span>
        <h1 className="mt-4 text-base font-bold text-navy">{title}</h1>
        <div className="mt-2 text-[13px] text-muted">{children}</div>
        <Contact company={company} />
      </div>
    </Frame>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px] font-semibold text-navy">
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
      {error ? <p className="mt-1 text-[12px] font-medium text-red-600">{error}</p> : hint ? <p className="mt-1 text-[12px] font-normal text-muted">{hint}</p> : null}
    </label>
  );
}

export function ApplyPage() {
  const { token } = useParams({ strict: false }) as { token: string };
  const query = useQuery({
    queryKey: ["apply", token],
    queryFn: () => formApi<View>(token, ""),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (query.isPending) {
    return (
      <Frame>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading your form…
        </div>
      </Frame>
    );
  }
  if (query.isError) {
    const notFound = query.error instanceof FormApiError && query.error.status === 404;
    return (
      <Message company={undefined} icon={<Lock className="h-5 w-5" />} title={notFound ? "This link isn't valid" : "We couldn't load your form"}>
        {notFound ? "Please check you opened the full link we sent you, or ask us for a new one." : "Please check your internet connection and try again."}
      </Message>
    );
  }

  const view = query.data;
  if (view.state === "submitted") {
    return (
      <Message company={view.company} icon={<CheckCircle2 className="h-6 w-6" />} title="Your form has been received">
        Thank you — {view.company.name} has your details{view.submittedAt ? ` (sent ${formatDate(view.submittedAt)})` : ""}. Your reference is{" "}
        <span className="font-mono font-semibold text-navy">{view.applicationNo}</span>. Your advisor will be in touch shortly.
      </Message>
    );
  }
  if (view.state !== "open") {
    return (
      <Message company={view.company} icon={<Lock className="h-5 w-5" />} title={view.state === "expired" ? "This link has expired" : "This link is no longer active"}>
        For your security, links stop working after a while or once a newer one is sent. Please ask your advisor for a fresh link.
      </Message>
    );
  }
  return <Wizard token={token} view={view} />;
}

function Wizard({ token, view }: { token: string; view: Open }) {
  const queryClient = useQueryClient();
  const today = todayIST();
  const [values, setValues] = useState<FormValues>(() => fromServer(view.form));
  const [step, setStep] = useState<StepIndex>(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [declaration, setDeclaration] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const lastSent = useRef(JSON.stringify(toPayload(fromServer(view.form))));
  const top = useRef<HTMLDivElement>(null);

  const referencesRequired = view.limits.referencesRequired;
  const errors = useMemo(() => fieldErrors(values, { referencesRequired, today }), [values, referencesRequired, today]);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setServerFields((f) => (f[key as string] ? { ...f, [key as string]: "" } : f));
  };
  const touch = (...keys: string[]) => setTouched((t) => new Set([...t, ...keys]));
  const shown = (key: string) => (touched.has(key) ? errors[key] || serverFields[key] : serverFields[key]);

  // Everything typed is saved a moment after the customer pauses, so closing the page loses nothing.
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => formApi(token, "", { method: "PUT", body: JSON.stringify(payload) }),
    onMutate: () => setSaveState("saving"),
    onSuccess: () => setSaveState("saved"),
    onError: () => setSaveState("error"),
  });
  const flush = async () => {
    const payload = toPayload(values);
    const sig = JSON.stringify(payload);
    if (sig === lastSent.current) return;
    lastSent.current = sig;
    await save.mutateAsync(payload).catch(() => {
      lastSent.current = "";
    });
  };
  useEffect(() => {
    const id = setTimeout(() => void flush(), 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["apply", token] });
  useEffect(() => {
    // The documents list depends on what the customer does for work, so refresh it when they get to that step.
    if (step === 4) void flush().then(refresh);
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const stepKeys = (s: StepIndex) => Object.keys(errors).filter((k) => STEP_OF[k] === s);
  const go = async (next: StepIndex) => {
    if (next > step) {
      const bad = stepKeys(step);
      if (bad.length) {
        touch(...bad);
        return;
      }
    }
    await flush();
    setStep(next);
  };

  const submit = useMutation({
    mutationFn: async () => {
      await flush();
      return formApi<{ applicationNo: string }>(token, "/submit", { method: "POST", body: JSON.stringify({ declaration: true }) });
    },
    onSuccess: (r) => setDone(r.applicationNo),
    onError: (e) => {
      if (e instanceof FormApiError && e.fields) {
        setServerFields(e.fields);
        const s = firstStepWithProblem(e.fields);
        if (s !== null) setStep(s);
      }
    },
  });

  if (done) {
    return (
      <Message company={view.company} icon={<CheckCircle2 className="h-6 w-6" />} title="Thank you — your form is in">
        {view.company.name} has received your details and documents. Your reference is{" "}
        <span className="font-mono font-semibold text-navy">{done}</span>. Your advisor will review everything and contact you.
      </Message>
    );
  }

  const allErrors = Object.keys(errors).length > 0;
  const lastStep = STEPS.length - 1;

  return (
    <Frame company={view.company}>
      <div ref={top} className="scroll-mt-4" />
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[13px] font-bold text-navy">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
          <p className={clsx("text-[12px]", saveState === "error" ? "font-semibold text-red-600" : "text-muted")} aria-live="polite">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && (<span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>)}
            {saveState === "error" && "Couldn't save — check your connection"}
          </p>
        </div>
        <div className="mt-2 flex gap-1" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1}>
          {STEPS.map((s, i) => (
            <span key={s} className={clsx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-navy" : "bg-line")} />
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          {view.product} · {view.applicationNo} · link valid till {formatDate(view.expiresAt)}
        </p>
      </div>

      <div key={step} className="card fade-enter space-y-4 p-5">
        {step === 0 && (
          <>
            <Field label="Full name (as on PAN)" error={shown("name")}>
              <input className="field" value={values.name} autoComplete="name" onChange={(e) => set("name", e.target.value)} onBlur={() => touch("name")} />
            </Field>
            <Field label="Mobile number" hint="This is the number your advisor has for you, so it can't be changed here.">
              <input className="field bg-bg-light text-muted" value={view.phone ?? ""} readOnly disabled />
            </Field>
            <Field label="Date of birth" error={shown("dateOfBirth")}>
              <DatePicker value={values.dateOfBirth} onChange={(v) => { set("dateOfBirth", v); touch("dateOfBirth"); }} max={yearsBefore(today, 18)} minYear={Number(today.slice(0, 4)) - 100} maxYear={Number(today.slice(0, 4)) - 18} placeholder="Choose your date of birth" clearable={false} />
            </Field>
            <Field label="PAN" error={shown("pan")}>
              <input className="field font-mono tracking-wider uppercase" value={values.pan} maxLength={10} autoCapitalize="characters" autoComplete="off" onChange={(e) => set("pan", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} onBlur={() => touch("pan")} placeholder="ABCDE1234F" />
            </Field>
            <Field label="Email (optional)" error={shown("email")}>
              <input type="email" className="field" value={values.email} autoComplete="email" onChange={(e) => set("email", e.target.value)} onBlur={() => touch("email")} />
            </Field>
            <Field label="Address" error={shown("address")}>
              <textarea className="field min-h-20" value={values.address} autoComplete="street-address" onChange={(e) => set("address", e.target.value)} onBlur={() => touch("address")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" error={shown("city")}>
                <input className="field" value={values.city} autoComplete="address-level2" onChange={(e) => set("city", e.target.value)} onBlur={() => touch("city")} />
              </Field>
              <Field label="Pincode" error={shown("pincode")}>
                <input className="field" inputMode="numeric" maxLength={6} value={values.pincode} autoComplete="postal-code" onChange={(e) => set("pincode", e.target.value.replace(/\D/g, ""))} onBlur={() => touch("pincode")} />
              </Field>
            </div>
            <Field label="Aadhaar — last 4 digits (optional)" error={shown("aadhaarLast4")} hint="We never ask for your full Aadhaar number here.">
              <input className="field w-28" inputMode="numeric" maxLength={4} value={values.aadhaarLast4} onChange={(e) => set("aadhaarLast4", e.target.value.replace(/\D/g, ""))} onBlur={() => touch("aadhaarLast4")} />
            </Field>
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" className="h-4 w-4 accent-navy" checked={values.isNRI} onChange={(e) => set("isNRI", e.target.checked)} />
              I am a Non-Resident Indian (NRI)
            </label>
          </>
        )}

        {step === 1 && (
          <>
            <Field label="What do you do for work?" error={shown("employmentType")}>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { set("employmentType", t); touch("employmentType"); }}
                    aria-pressed={values.employmentType === t}
                    className={clsx("rounded-md border px-3 py-2.5 text-[13px] font-semibold transition", values.employmentType === t ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:border-navy/40")}
                  >
                    {EMPLOYMENT_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </Field>
            {values.employmentType && values.employmentType !== "OTHER" && (
              <Field label={values.employmentType === "SALARIED" ? "Employer name" : "Business or firm name"} error={shown("employerName")}>
                <input className="field" value={values.employerName} onChange={(e) => set("employerName", e.target.value)} onBlur={() => touch("employerName")} />
              </Field>
            )}
            {isBusiness(values) && !values.isNRI && (
              <Field label="How is your business set up?" error={shown("constitution")}>
                <select className="field" value={values.constitution} onChange={(e) => { set("constitution", e.target.value as ApplicantConstitution); touch("constitution"); }}>
                  <option value="">Choose…</option>
                  {(Object.keys(CONSTITUTION_LABEL) as ApplicantConstitution[]).map((c) => (
                    <option key={c} value={c}>{CONSTITUTION_LABEL[c]}</option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Monthly income (₹)" error={shown("monthlyIncome")} hint={values.monthlyIncome ? `₹ ${formatIndianNumber(Number(values.monthlyIncome))} a month` : "Your average take-home or business income per month"}>
              <input className="field" inputMode="numeric" value={values.monthlyIncome} onChange={(e) => set("monthlyIncome", e.target.value.replace(/\D/g, ""))} onBlur={() => touch("monthlyIncome")} />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <p className="rounded-md bg-bg-light px-3 py-2 text-[13px] text-muted">
              You are applying for a <span className="font-semibold text-navy">{view.product}</span>.
            </p>
            <Field label="Loan amount you need (₹)" error={shown("requestedAmount")} hint={values.requestedAmount ? `₹ ${formatIndianNumber(Number(values.requestedAmount))}` : undefined}>
              <input className="field" inputMode="numeric" value={values.requestedAmount} onChange={(e) => set("requestedAmount", e.target.value.replace(/\D/g, ""))} onBlur={() => touch("requestedAmount")} />
            </Field>
            <Field label="Repayment period in months (optional)" error={shown("tenureMonths")} hint={values.tenureMonths ? tenureInWords(Number(values.tenureMonths)) : "For example 120 for 10 years"}>
              <input className="field w-32" inputMode="numeric" maxLength={3} value={values.tenureMonths} onChange={(e) => set("tenureMonths", e.target.value.replace(/\D/g, ""))} onBlur={() => touch("tenureMonths")} />
            </Field>
            <Field label="What is the loan for? (optional)">
              <textarea className="field min-h-20" value={values.purpose} maxLength={500} onChange={(e) => set("purpose", e.target.value)} />
            </Field>
          </>
        )}

        {step === 3 && (
          <>
            <p className="text-[13px] text-muted">
              {referencesRequired > 0
                ? `Please give ${referencesRequired === 1 ? "one person" : `${referencesRequired} people`} we can call to confirm your details — not family living with you if possible.`
                : "If you like, add people we can call to confirm your details."}
            </p>
            {shown("references") && touched.has("references") && <p className="text-[12px] font-medium text-red-600">{errors.references}</p>}
            {values.references.map((r, i) => (
              <div key={i} className="space-y-3 rounded-lg border border-line p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-bold tracking-wide text-muted uppercase">Reference {i + 1}</p>
                  <button type="button" aria-label={`Remove reference ${i + 1}`} className="rounded p-1 text-muted hover:bg-bg-light hover:text-red-600" onClick={() => set("references", values.references.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {(["name", "phone", "relation", "address"] as const).map((k) => (
                  <Field key={k} label={{ name: "Name", phone: "Mobile number", relation: "How do they know you? (optional)", address: "Address (optional)" }[k]}>
                    <input
                      className="field"
                      value={r[k]}
                      inputMode={k === "phone" ? "numeric" : undefined}
                      maxLength={k === "phone" ? 10 : undefined}
                      onChange={(e) => set("references", values.references.map((x, j) => (j === i ? { ...x, [k]: k === "phone" ? e.target.value.replace(/\D/g, "") : e.target.value } : x)))}
                      onBlur={() => touch("references")}
                    />
                  </Field>
                ))}
              </div>
            ))}
            {values.references.length < 4 && (
              <button type="button" className="btn-ghost w-full" onClick={() => { set("references", [...values.references, { name: "", phone: "", relation: "", address: "" }]); touch("references"); }}>
                <Plus className="h-4 w-4" /> Add {values.references.length ? "another" : "a"} reference
              </button>
            )}
          </>
        )}

        {step === 4 && <DocumentsStep token={token} view={view} onChanged={refresh} />}

        {step === 5 && (
          <>
            <Summary values={values} view={view} errors={errors} onEdit={(s) => setStep(s)} />
            {Object.keys(serverFields).some((k) => serverFields[k]) && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">Some details need another look — they're marked above.</p>
            )}
            <label className="flex items-start gap-2.5 rounded-md bg-bg-light p-3 text-[13px] text-ink">
              <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-navy" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} />
              <span>
                I confirm the details and documents I have given are true and complete. I allow {view.company.name} to share them with banks and lenders and to obtain my credit report in order to process this loan.
              </span>
            </label>
            {submit.isError && !(submit.error instanceof FormApiError && submit.error.fields) && (
              <p className="text-[13px] font-medium text-red-600">{(submit.error as Error).message}</p>
            )}
          </>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" className="btn-ghost" disabled={step === 0} onClick={() => void go((step - 1) as StepIndex)}>
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        {step < lastStep ? (
          <button type="button" className="btn-primary" onClick={() => void go((step + 1) as StepIndex)}>
            Next <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" className="btn-primary" disabled={!declaration || allErrors || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Send my application
          </button>
        )}
      </div>
      {step === lastStep && allErrors && <p className="mt-2 text-right text-[12px] text-muted">Fix the items marked above to send your application.</p>}
      <Contact company={view.company} />
    </Frame>
  );
}

function Summary({ values, view, errors, onEdit }: { values: FormValues; view: Open; errors: Record<string, string>; onEdit: (s: StepIndex) => void }) {
  const rows: { label: string; value: string; field: string }[] = [
    { label: "Name", value: values.name, field: "name" },
    { label: "Date of birth", value: values.dateOfBirth ? formatDate(`${values.dateOfBirth}T00:00:00+05:30`) : "", field: "dateOfBirth" },
    { label: "PAN", value: values.pan, field: "pan" },
    { label: "Address", value: [values.address, values.city, values.pincode].filter(Boolean).join(", "), field: "address" },
    { label: "Work", value: values.employmentType ? `${EMPLOYMENT_TYPE_LABEL[values.employmentType]}${values.employerName ? ` · ${values.employerName}` : ""}` : "", field: "employmentType" },
    { label: "Monthly income", value: values.monthlyIncome ? `₹ ${formatIndianNumber(Number(values.monthlyIncome))}` : "", field: "monthlyIncome" },
    { label: "Loan amount", value: values.requestedAmount ? `₹ ${formatIndianNumber(Number(values.requestedAmount))}${values.tenureMonths ? ` · ${tenureInWords(Number(values.tenureMonths))}` : ""}` : "", field: "requestedAmount" },
    { label: "References", value: values.references.filter((r) => r.name && r.phone).map((r) => r.name).join(", "), field: "references" },
    { label: "Documents", value: `${view.documents.length} uploaded`, field: "" },
  ];
  return (
    <dl className="divide-y divide-line/70">
      {rows.map((r) => {
        const step = r.field ? STEP_OF[r.field] : 4;
        const bad = r.field ? errors[r.field] : undefined;
        return (
          <div key={r.label} className="flex items-start justify-between gap-3 py-2.5 text-[13px]">
            <div className="min-w-0">
              <dt className="text-[11px] font-bold tracking-wide text-muted uppercase">{r.label}</dt>
              <dd className={clsx("mt-0.5 break-words", bad ? "font-medium text-red-600" : "text-ink")}>{bad ?? (r.value || "—")}</dd>
            </div>
            <button type="button" className="shrink-0 text-[12px] font-semibold text-navy underline-offset-2 hover:underline" onClick={() => onEdit(step)}>
              {bad ? "Fix" : "Edit"}
            </button>
          </div>
        );
      })}
    </dl>
  );
}

function DocumentsStep({ token, view, onChanged }: { token: string; view: Open; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [other, setOther] = useState(view.categories[0] ?? "Other");
  const full = view.documents.length >= view.limits.maxFiles;

  const upload = async (file: File, category: string) => {
    setError(null);
    if (file.size > view.limits.maxFileMb * 1024 * 1024) {
      setError(`"${file.name}" is larger than ${view.limits.maxFileMb} MB. Please upload a smaller file or a photo of it.`);
      return;
    }
    setBusy(category);
    try {
      const body = new FormData();
      body.append("category", category);
      body.append("file", file);
      await formApi(token, "/documents", { method: "POST", body });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — please try again");
    } finally {
      setBusy(null);
    }
  };
  const remove = async (id: string) => {
    setError(null);
    try {
      await formApi(token, `/documents/${id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove that file");
    }
  };

  const picker = (category: string, label: string) => (
    <label className={clsx("btn-ghost cursor-pointer", (full || busy !== null) && "pointer-events-none opacity-60")}>
      {busy === category ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {label}
      <input
        type="file"
        className="sr-only"
        accept="application/pdf,image/*"
        disabled={full || busy !== null}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void upload(f, category);
        }}
      />
    </label>
  );
  const fileRow = (d: Open["documents"][number]) => (
    <li key={d.id} className="flex items-center gap-2 rounded-md bg-bg-light px-2.5 py-1.5 text-[13px]">
      <FileText className="h-4 w-4 shrink-0 text-navy/60" />
      <span className="min-w-0 flex-1 truncate">{d.fileName}</span>
      <span className="shrink-0 text-[12px] text-muted">{formatBytes(d.sizeBytes)}</span>
      <button type="button" aria-label={`Remove ${d.fileName}`} className="rounded p-1 text-muted hover:bg-white hover:text-red-600" onClick={() => void remove(d.id)}>
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );

  const listed = new Set(view.checklist.map((i) => i.category));
  const extras = view.documents.filter((d) => !listed.has(d.category));
  // Several checklist rows can share a category; show each category's files once.
  const seen = new Set<string>();

  return (
    <>
      <p className="text-[13px] text-muted">
        Upload a clear photo or PDF of each document (up to {view.limits.maxFileMb} MB each). You can come back to this link and add more any time before you send the form.
      </p>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>}
      {view.checklist.length > 0 && (
        <ul className="space-y-3">
          {view.checklist.map((item, i) => {
            const mine = seen.has(item.category) ? [] : view.documents.filter((d) => d.category === item.category);
            seen.add(item.category);
            return (
              <li key={`${item.category}-${i}`} className="rounded-lg border border-line p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-navy">{item.label}</p>
                    {item.received && <p className="mt-0.5 flex items-center gap-1 text-[12px] font-semibold text-emerald-700"><Check className="h-3 w-3" /> Received</p>}
                  </div>
                  {picker(item.category, mine.length || item.received ? "Add more" : "Upload")}
                </div>
                {mine.length > 0 && <ul className="mt-2 space-y-1.5">{mine.map(fileRow)}</ul>}
              </li>
            );
          })}
        </ul>
      )}
      <div className="rounded-lg border border-dashed border-line p-3">
        <p className="text-[13px] font-semibold text-navy">Anything else you'd like to add</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className="field w-auto min-w-40 flex-1" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Type of document">
            {[...new Set([...view.categories, "Other"])].map((c) => <option key={c}>{c}</option>)}
          </select>
          {picker(other, "Upload")}
        </div>
        {extras.length > 0 && <ul className="mt-2 space-y-1.5">{extras.map(fileRow)}</ul>}
      </div>
      {full && <p className="text-[12px] text-muted">You've reached the limit of {view.limits.maxFiles} files for this link.</p>}
      <p className="flex items-center gap-1.5 text-[12px] text-muted"><Phone className="h-3 w-3" /> Trouble uploading? Send the files to your advisor on WhatsApp instead.</p>
    </>
  );
}
