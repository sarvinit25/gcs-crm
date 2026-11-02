import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import clsx from "clsx";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { suggestions, toRequest, type ChatMessage } from "../lib/assistant";

/**
 * The floating "ask the CRM" helper on every screen. It reads live records
 * through the server, which applies this person's own permissions — nothing
 * is stored, and "New chat" simply empties the list.
 */
export function Assistant() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const status = useQuery({
    queryKey: ["assistant-status"],
    queryFn: () => api<{ enabled: boolean; configured: boolean }>("/assistant/status"),
    staleTime: 5 * 60_000,
    enabled: Boolean(user),
  });

  const ask = useMutation({
    mutationFn: (turns: { role: string; content: string }[]) =>
      api<{ reply: string }>("/assistant/chat", { method: "POST", body: JSON.stringify({ messages: turns }) }),
  });

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages, ask.isPending, open]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!user || status.data?.enabled === false) return null;

  const send = (text: string) => {
    const content = text.trim();
    if (!content || ask.isPending) return;
    const mine: ChatMessage = { id: nextId.current++, role: "user", content };
    const history = [...messages, mine];
    setMessages(history);
    setDraft("");
    ask.mutate(toRequest(history), {
      onSuccess: ({ reply }) =>
        setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: reply }]),
      onError: (err) => {
        // The question stays visible but is marked, and is not sent again with the next one.
        setMessages((m) => m.map((x) => (x.id === mine.id ? { ...x, failed: true } : x)));
        setMessages((m) => [
          ...m,
          { id: nextId.current++, role: "assistant", content: (err as Error).message, failed: true },
        ]);
      },
    });
  };

  const newChat = () => {
    ask.reset();
    setMessages([]);
    setDraft("");
    input.current?.focus();
  };

  return (
    <div className="no-print">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full bg-navy px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-navy-soft lg:right-6 lg:bottom-6"
          aria-label="Ask the CRM assistant"
        >
          <Sparkles className="h-4 w-4 text-gold" />
          Ask
        </button>
      )}

      {open && (
        <section
          role="dialog"
          aria-label="CRM assistant"
          className="fixed inset-x-0 bottom-0 z-50 flex h-[min(34rem,85vh)] flex-col overflow-hidden rounded-t-2xl border border-line bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[26rem] sm:rounded-2xl"
        >
          <header className="flex items-center justify-between gap-2 border-b border-line bg-navy px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold" />
              <div className="leading-tight">
                <p className="text-sm font-bold">Ask the CRM</p>
                <p className="text-[11px] text-white/60">Live data · only what you can see</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={newChat}
                disabled={!messages.length}
                title="New chat — clears this conversation"
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-white/80 transition hover:bg-white/10 disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" /> New chat
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
                className="rounded-md p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-bg-light/60 px-4 py-4">
            {status.data && !status.data.configured && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                The assistant isn't set up yet. An admin needs to add the OpenAI key on the server.
              </p>
            )}

            {!messages.length && (
              <div>
                <p className="text-[13px] text-muted">
                  Ask about files, leads or customers in plain English or Hinglish. For example:
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {suggestions(user.role).map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px] font-medium text-navy transition hover:border-gold hover:bg-gold-pale/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <p
                  className={clsx(
                    "max-w-[88%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? m.failed
                        ? "bg-navy/60 text-white"
                        : "bg-navy text-white"
                      : m.failed
                        ? "border border-red-200 bg-red-50 text-red-700"
                        : "border border-line bg-white text-ink",
                  )}
                >
                  {m.content}
                </p>
              </div>
            ))}

            {ask.isPending && (
              <div className="flex justify-start">
                <p className="flex items-center gap-2 rounded-2xl border border-line bg-white px-3.5 py-2 text-[13px] text-muted">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking it up…
                </p>
              </div>
            )}
            <div ref={bottom} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-end gap-2 border-t border-line bg-white p-3"
          >
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Ask anything about your files…"
              className="field max-h-28 min-h-[2.5rem] flex-1 resize-none py-2"
            />
            <button
              type="submit"
              disabled={!draft.trim() || ask.isPending}
              aria-label="Send"
              className="btn-primary !px-3 !py-2.5"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
