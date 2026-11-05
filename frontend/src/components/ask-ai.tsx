import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Send, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { GiaOrb, type GiaMood } from "./gia-orb";

// `content` is what is shown. `raw` is what goes back to the assistant as history: it still holds placeholders where
// a PAN or date of birth was shown, so those numbers are never sent to the AI service.
type Message = { role: "user" | "assistant"; content: string; raw?: string };

const SUGGESTIONS = [
  "Which follow-ups are due today?",
  "Show the newest leads",
  "How is my pipeline?",
  "Tell me about lead #1",
];

/** A read-only chat for staff: ask about a client or the pipeline, answered from the CRM's own data. */
export function AskAi() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  // a short bright flare when an answer arrives
  const [flare, setFlare] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const status = useQuery({
    queryKey: ["assistant-status"],
    queryFn: () => api<{ enabled: boolean }>("/assistant/status"),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const ask = useMutation({
    mutationFn: (history: Message[]) =>
      api<{ reply: string; raw?: string }>("/assistant/ask", {
        method: "POST",
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, content: m.raw ?? m.content })) }),
      }),
    onSuccess: ({ reply, raw }) => {
      setMessages((m) => [...m, { role: "assistant", content: reply, raw: raw ?? reply }]);
      setFlare(true);
    },
    onError: (e) => setError((e as Error).message),
  });

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, ask.isPending, open]);

  useEffect(() => {
    if (!flare) return;
    const t = window.setTimeout(() => setFlare(false), 2500);
    return () => window.clearTimeout(t);
  }, [flare]);

  // The ring around the G shows what the assistant is doing: swirling fast while it looks things up, calm when idle.
  const mood: GiaMood = error ? "concerned" : ask.isPending ? "thinking" : flare ? "joy" : "idle";

  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;
    const next = [...messages, { role: "user" as const, content }];
    setMessages(next);
    setDraft("");
    setError("");
    ask.mutate(next);
  };

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close the assistant" : "Ask the assistant"}
        className="no-print fixed right-4 bottom-4 z-40 flex h-[72px] items-center gap-2.5 rounded-full bg-navy px-2 pr-5 text-white shadow-lg ring-1 ring-gold/50 transition-all duration-300 hover:-translate-y-0.5 active:scale-95"
      >
        {open ? (
          <span className="grid h-16 w-16 place-items-center">
            <X className="h-5 w-5" />
          </span>
        ) : (
          <GiaOrb mood={mood} tone="dark" className="h-16 w-16" />
        )}
        <span className="text-left">
          <span className="block text-sm leading-tight font-bold">{open ? "Close" : "Ask Gia"}</span>
          <span className="block text-[10px] text-white/70">{open ? "the assistant" : "AI assistant"}</span>
        </span>
      </button>

      {open && (
        <div className="no-print card pop-enter fixed right-4 bottom-[6.25rem] z-40 flex h-[32rem] max-h-[calc(100vh-8rem)] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden shadow-xl">
          <div className="flex items-center gap-3 bg-navy px-4 py-3 text-white">
            <GiaOrb mood={mood} tone="dark" className="h-[52px] w-[52px]" />
            <div className="min-w-0">
              <p className="text-[14px] leading-tight font-bold">Gia</p>
              <p className="mt-0.5 text-[11px] text-white/70">Ask about a client or your pipeline. It only reads.</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-[13px]">
            {status.data && !status.data.enabled && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-800">
                The assistant is not switched on yet. Ask your admin to add the OpenAI key on the server.
              </p>
            )}
            {messages.length === 0 && (
              <div className="space-y-1.5">
                <p className="text-muted">Try asking:</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="block w-full rounded-md border border-line px-3 py-2 text-left text-navy transition hover:bg-bg-light">
                    {s}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <p
                  className={clsx(
                    "max-w-[85%] rounded-lg px-3 py-2 break-words whitespace-pre-wrap",
                    m.role === "user" ? "bg-navy text-white" : "bg-bg-light text-navy",
                  )}
                >
                  {m.content}
                </p>
              </div>
            ))}
            {ask.isPending && (
              <p className="flex items-center gap-2 text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking it up…
              </p>
            )}
            {error && <p className="rounded-md bg-red-50 px-3 py-2 text-red-700">{error}</p>}
            <div ref={end} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 border-t border-line p-3"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask a question…"
              maxLength={1000}
              className="field flex-1 py-2 text-[13px]"
              aria-label="Your question"
            />
            <button className="btn-primary px-3 py-2" disabled={!draft.trim() || ask.isPending} aria-label="Send">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
