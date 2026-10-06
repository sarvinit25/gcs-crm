import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import clsx from "clsx";
import { api, tokenStore } from "../lib/api";
import { todayIST } from "../lib/date";
import { AD_STATUS, MAX_AD_MB, adFileProblem, type WebsiteAd } from "../lib/website";
import { Modal } from "./modal";
import { DatePicker, formatPickerDate } from "./date-picker";

/** The poster is only reachable with a login, so fetch it with the token and show it from memory. */
function useAdImage(id: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    let url: string | null = null;
    let cancelled = false;
    void fetch(`/crm/api/website-ads/${id}/image`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) setSrc((url = URL.createObjectURL(blob)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return src;
}

function Thumb({ ad, onOpen }: { ad: WebsiteAd; onOpen: () => void }) {
  const src = useAdImage(ad.id);
  return (
    <button type="button" onClick={onOpen} title="View the poster" className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-bg-light">
      {src ? <img src={src} alt={ad.title} className="h-full w-full object-cover" /> : <Loader2 className="h-4 w-4 animate-spin text-muted" />}
    </button>
  );
}

function PosterModal({ ad, onClose }: { ad: WebsiteAd; onClose: () => void }) {
  const src = useAdImage(ad.id);
  return (
    <Modal title={ad.title} subtitle={`${formatPickerDate(ad.startsOn)} to ${formatPickerDate(ad.endsOn)}`} onClose={onClose} maxWidth="max-w-xl">
      {src ? <img src={src} alt={ad.title} className="mx-auto max-h-[70vh] rounded-lg" /> : <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted" />}
    </Modal>
  );
}

function AdForm({ ad, onClose }: { ad?: WebsiteAd; onClose: () => void }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState(ad?.startsOn ?? todayIST());
  const [end, setEnd] = useState(ad?.endsOn ?? "");
  const existing = useAdImage(ad?.id ?? null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const save = useMutation({
    mutationFn: async (f: FormData) => {
      if (ad) {
        return api(`/website-ads/${ad.id}`, {
          method: "PATCH",
          body: JSON.stringify({ title: f.get("title"), linkUrl: f.get("linkUrl"), startsOn: f.get("startsOn"), endsOn: f.get("endsOn") }),
        });
      }
      const res = await fetch("/crm/api/website-ads", { method: "POST", headers: { Authorization: `Bearer ${tokenStore.get()}` }, body: f });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(Array.isArray(json?.message) ? json.message.join(", ") : (json?.message ?? "Could not upload the poster"));
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["website-ads"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Modal title={ad ? "Edit pop-up ad" : "New pop-up ad"} subtitle="Shown to website visitors between the two dates, India time" onClose={onClose} maxWidth="max-w-lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const f = new FormData(e.currentTarget);
          if (!ad) {
            if (!file) return setError("Choose the poster image");
            const problem = adFileProblem(file);
            if (problem) return setError(problem);
            f.set("file", file);
          }
          if (!end) return setError("Choose the last day it should run");
          if (end < start) return setError("The last day cannot be before the first day");
          save.mutate(f);
        }}
      >
        {!ad && (
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                setFile(picked);
                setError(picked ? adFileProblem(picked) : null);
              }}
            />
            <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line bg-bg-light/60 p-3 text-[13px] text-muted transition hover:border-navy/40">
              {preview ? (
                <img src={preview} alt="Chosen poster" className="max-h-56 rounded" />
              ) : (
                <>
                  <ImagePlus className="h-6 w-6" />
                  <span className="font-semibold text-navy">Choose the poster image</span>
                  <span>PNG, JPG or WebP, up to {MAX_AD_MB} MB</span>
                </>
              )}
            </button>
            {file && <p className="mt-1 text-[12px] text-muted">{file.name} · {(file.size / 1024).toFixed(0)} KB · click the picture to change it</p>}
          </div>
        )}
        {ad && existing && <img src={existing} alt={ad.title} className="mx-auto max-h-40 rounded" />}
        <label className="block text-[12px] font-semibold text-muted">
          Name (for your own reference)
          <input name="title" required minLength={2} maxLength={80} defaultValue={ad?.title} placeholder="e.g. Diwali home-loan offer" className="field mt-1 font-normal" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12px] font-semibold text-muted">
            First day
            <DatePicker name="startsOn" required value={start} onChange={setStart} clearable={false} className="mt-1" />
          </label>
          <label className="block text-[12px] font-semibold text-muted">
            Last day
            <DatePicker name="endsOn" required value={end} onChange={setEnd} min={start} clearable={false} className="mt-1" />
          </label>
        </div>
        <label className="block text-[12px] font-semibold text-muted">
          Link when someone clicks the poster (optional)
          <input name="linkUrl" type="url" maxLength={500} defaultValue={ad?.linkUrl ?? ""} placeholder="https://…" className="field mt-1 font-normal" />
        </label>
        {error && <p className="text-[13px] text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {ad ? "Save changes" : "Upload and schedule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function WebsiteAds() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<WebsiteAd | "new" | null>(null);
  const [viewing, setViewing] = useState<WebsiteAd | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ads = useQuery({ queryKey: ["website-ads"], queryFn: () => api<{ items: WebsiteAd[] }>("/website-ads") });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["website-ads"] });
  const toggle = useMutation({
    mutationFn: (ad: WebsiteAd) => api(`/website-ads/${ad.id}`, { method: "PATCH", body: JSON.stringify({ paused: !ad.paused }) }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (ad: WebsiteAd) => api(`/website-ads/${ad.id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-muted">
          A poster that pops up in the middle of the website, over a blurred page. It appears after a visitor has spent 20 seconds on the site and when they come back to the tab,
          and closes itself after 8 seconds or when they press the cross. Upload it here and choose the days it should run. If two are running, the one that started last is shown.
        </p>
        <button onClick={() => setEditing("new")} className="btn-primary">
          <Plus className="h-4 w-4" /> New pop-up ad
        </button>
      </div>
      {error && <p className="mb-3 text-[13px] text-red-600">{error}</p>}

      {ads.isPending ? (
        <div className="card p-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-muted" /></div>
      ) : ads.isError ? (
        <p className="py-10 text-center text-sm text-red-600">{(ads.error as Error).message}</p>
      ) : !ads.data.items.length ? (
        <div className="card p-10 text-center text-sm text-muted">
          <ImagePlus className="mx-auto mb-2 h-6 w-6 text-muted/50" />
          No pop-up ads yet. Upload a poster and pick the days it should run.
        </div>
      ) : (
        <div className="space-y-3">
          {ads.data.items.map((ad) => {
            const st = AD_STATUS[ad.status];
            return (
              <div key={ad.id} className="card flex flex-wrap items-center gap-4 p-4">
                <Thumb ad={ad} onOpen={() => setViewing(ad)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-navy">{ad.title}</p>
                    <span title={st.hint} className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", st.chip)}>{st.label}</span>
                  </div>
                  <p className="mt-1 text-[13px] text-muted">
                    {formatPickerDate(ad.startsOn)} <span aria-hidden>→</span> {formatPickerDate(ad.endsOn)}
                  </p>
                  {ad.linkUrl && <p className="mt-0.5 truncate text-[12px] text-muted">Opens {ad.linkUrl}</p>}
                  <p className="mt-0.5 text-[12px] text-muted">Uploaded by {ad.createdByName}</p>
                </div>
                <div className="flex gap-2">
                  {ad.status !== "ENDED" && (
                    <button className="btn-ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(ad)}>
                      {ad.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {ad.paused ? "Resume" : "Pause"}
                    </button>
                  )}
                  <button className="btn-ghost" onClick={() => setEditing(ad)}>
                    <Pencil className="h-4 w-4" /> Edit
                  </button>
                  <button
                    className="btn-ghost text-red-600"
                    disabled={remove.isPending}
                    onClick={() => window.confirm(`Delete "${ad.title}"? The poster is removed for good.`) && remove.mutate(ad)}
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <AdForm ad={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {viewing && <PosterModal ad={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
