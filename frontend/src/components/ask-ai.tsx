import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Send, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";

type Message = { role: "user" | "assistant"; content: string };

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
  const end = useRef<HTMLDivElement>(null);

  const status = useQuery({
    queryKey: ["assistant-status"],
    queryFn: () => api<{ enabled: boolean }>("/assistant/status"),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const ask = useMutation({
    mutationFn: (history: Message[]) =>
      api<{ reply: string }>("/assistant/ask", { method: "POST", body: JSON.stringify({ messages: history }) }),
    onSuccess: ({ reply }) => setMessages((m) => [...m, { role: "assistant", content: reply }]),
    onError: (e) => setError((e as Error).message),
  });

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages, ask.isPending, open]);

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
        className="no-print fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-[13px] font-semibold text-white shadow-lg transition hover:bg-navy/90"
      >
        {open ? <X className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-gold" />}
        {open ? "Close" : "Ask AI"}
      </button>

      {open && (
        <div className="no-print card pop-enter fixed right-4 bottom-20 z-40 flex h-[32rem] max-h-[calc(100vh-7rem)] w-[24rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden shadow-xl">
          <div className="border-b border-line px-4 py-3">
            <p className="text-[13px] font-bold text-navy">Ask about a client or your pipeline</p>
            <p className="text-[11px] text-muted">It only reads. It shows what you can already see in the CRM.</p>
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
