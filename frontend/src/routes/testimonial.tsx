import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Lock, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { LogoMark } from "../components/logo";

const LOANS = ["Home Loan", "Home Loan Balance Transfer", "Loan Against Property", "Business Loan", "Personal Loan", "Education Loan", "Car Loan", "Other"];
const CITIES = ["Mumbai", "Thane", "Navi Mumbai", "Pune", "Kalyan", "Panvel", "Nashik"];
const MAX_QUOTE = 1200;

/** Phone photos are often several MB. Shrink them in the browser so they upload quickly and never hit the size limit. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-bg-light">
      <header className="bg-navy px-4 py-4">
        <div className="mx-auto flex max-w-xl items-center gap-2.5">
          <LogoMark size="md" />
          <div className="leading-tight text-white">
            <p className="font-bold">Growth Capital Services</p>
            <p className="flex items-center gap-1 text-xs text-white/60"><Lock className="h-3 w-3" /> Share your experience</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-6">{children}</main>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-[13px] font-semibold text-navy">
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
      {hint && <p className="mt-1 text-[12px] font-normal text-muted">{hint}</p>}
    </label>
  );
}

/** The page a client opens from a link to tell us how it went. Nothing is published: we read it first. */
export function TestimonialPage() {
  const [v, setV] = useState({ name: "", city: "", product: "", role: "", contact: "", quote: "", signedName: "", website: "" });
  const [rating, setRating] = useState(0);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [consentWords, setConsentWords] = useState(false);
  const [consentPhoto, setConsentPhoto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof v, value: string) => setV((x) => ({ ...x, [k]: value }));

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (file: File) => {
    setError("");
    if (!/^image\//.test(file.type)) { setError("Please choose a picture (JPG, PNG or WebP)."); return; }
    setPhotoBusy(true);
    const blob = await shrink(file);
    setPhotoBusy(false);
    if (blob.size > 4 * 1024 * 1024) { setError("That photo is too large. Please choose a smaller one."); return; }
    setPhoto(blob);
    setPreview(URL.createObjectURL(blob));
  };
  const clearPhoto = () => { setPhoto(null); setPreview(""); setConsentPhoto(false); };

  const problem =
    v.name.trim().length < 2 ? "Please enter your full name." :
    rating < 1 ? "Please choose a rating from 1 to 5." :
    v.quote.trim().length < 20 ? "Please write a little more, at least a couple of sentences." :
    !consentWords ? "Please tick the box that lets us publish your words, name and city." :
    v.signedName.trim().length < 2 ? "Please type your full name as your signature." : "";

  const submit = async () => {
    setError("");
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const body = new FormData();
      for (const [k, val] of Object.entries(v)) body.append(k, val);
      body.append("rating", String(rating));
      body.append("consentWords", "true");
      body.append("consentPhoto", photo && consentPhoto ? "true" : "false");
      if (photo) body.append("photo", photo, "photo.jpg");
      const res = await fetch("/crm/api/public/testimonials", { method: "POST", body });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(Array.isArray(j?.message) ? j.message.join(", ") : (j?.message ?? (res.status === 429 ? "You have tried a few times. Please wait a few minutes and try again." : "Something went wrong. Please try again.")));
      }
      setDone(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Frame>
        <div className="card dialog-enter p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold-pale text-gold-dark"><CheckCircle2 className="h-6 w-6" /></span>
          <h1 className="mt-4 text-base font-bold text-navy">Thank you</h1>
          <p className="mt-2 text-[13px] text-muted">We have your message. We read every one, and we will not publish anything you did not agree to. If you want yours taken down later, write to connect.gcs@growthcapitalservices.in or call +91 88280 01700.</p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="card dialog-enter space-y-4 p-5">
        <div>
          <h1 className="text-lg font-bold text-navy">Share your experience</h1>
          <p className="mt-1 text-[13px] text-muted">Thank you for trusting us with your loan. Tell us how it went. It takes about five minutes.</p>
        </div>

        <Field label="Your full name"><input className="field" value={v.name} maxLength={120} autoComplete="name" onChange={(e) => set("name", e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="City"><input className="field" value={v.city} maxLength={80} list="t-cities" autoComplete="address-level2" onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="Loan you took with us">
            <select className="field" value={v.product} onChange={(e) => set("product", e.target.value)}>
              <option value="">Select…</option>
              {LOANS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </Field>
        </div>
        <datalist id="t-cities">{CITIES.map((c) => <option key={c} value={c} />)}</datalist>
        <Field label="Your work" hint="For example: shop owner, engineer, teacher."><input className="field" value={v.role} maxLength={120} onChange={(e) => set("role", e.target.value)} /></Field>

        <div>
          <p className="text-[13px] font-semibold text-navy">Rate us out of 5</p>
          <div className="mt-1.5 grid grid-cols-5 gap-2" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)}
                className={clsx("h-12 rounded-lg border text-lg font-bold transition", rating === n ? "border-navy bg-navy text-white" : "border-line bg-white text-navy hover:bg-bg-light")}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <Field label="Your words" hint="Two to four sentences is plenty. What did you need? How did we help? How was the process? Would you recommend us?">
          <textarea className="field" rows={6} value={v.quote} maxLength={MAX_QUOTE} onChange={(e) => set("quote", e.target.value)} />
          <p className="mt-1 text-right text-[11px] text-muted">{v.quote.length}/{MAX_QUOTE}</p>
        </Field>

        <div>
          <p className="text-[13px] font-semibold text-navy">Your photo</p>
          <p className="mt-0.5 text-[12px] text-muted">A clear, front-facing photo in good light, with only you in it.</p>
          <div className="mt-2 flex items-center gap-3">
            {preview ? <img src={preview} alt="Your photo" className="h-20 w-20 rounded-full object-cover ring-2 ring-gold-pale" /> : <span className="grid h-20 w-20 place-items-center rounded-full border border-dashed border-gold bg-gold-pale/40 text-[11px] text-muted">No photo</span>}
            <div className="space-y-1">
              <label className={clsx("btn-ghost cursor-pointer", photoBusy && "pointer-events-none opacity-60")}>
                {photoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {preview ? "Change photo" : "Add a photo"}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f); }} />
              </label>
              {preview && <button type="button" className="ml-2 inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-red-600" onClick={clearPhoto}><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
            </div>
          </div>
        </div>

        <Field label="Your phone or email" hint="Only so we can check with you if needed. It is never published."><input className="field" value={v.contact} maxLength={120} onChange={(e) => set("contact", e.target.value)} /></Field>

        <div className="space-y-2.5 rounded-lg border border-line bg-bg-light/60 p-3">
          <p className="text-[12px] font-bold tracking-wide text-navy uppercase">Your permission</p>
          <label className="flex items-start gap-2.5 text-[13px]"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-navy" checked={consentWords} onChange={(e) => setConsentWords(e.target.checked)} /><span><strong className="text-navy">My words, name and city.</strong> I give Growth Capital Services permission to publish them on its website, social media pages and printed material. These are my own words and my experience is true.</span></label>
          <label className={clsx("flex items-start gap-2.5 text-[13px]", !photo && "opacity-50")}><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-navy" disabled={!photo} checked={consentPhoto && Boolean(photo)} onChange={(e) => setConsentPhoto(e.target.checked)} /><span><strong className="text-navy">My photo.</strong> I also give permission to use my photo together with my words. Leave this unticked if you do not want your photo used.</span></label>
          <p className="text-[12px] text-muted">You can ask us to take it down at any time by writing to connect.gcs@growthcapitalservices.in or calling +91 88280 01700.</p>
        </div>

        <Field label="Your signature" hint="Type your full name. This is your signature for the permission above."><input className="field" value={v.signedName} maxLength={120} onChange={(e) => set("signedName", e.target.value)} /></Field>

        {/* A field real people never see: a bot that fills it in is dropped. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set("website", e.target.value)} /></label>
        </div>

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>}
        <button type="button" className="btn-primary w-full justify-center" disabled={busy || photoBusy} onClick={() => void submit()}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send
        </button>
        <p className="text-center text-[12px] text-muted">Questions? Call +91 88280 01700 or WhatsApp +91 88280 03900.</p>
      </div>
    </Frame>
  );
}
