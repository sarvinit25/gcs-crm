export type ChatMessage = { id: number; role: "user" | "assistant"; content: string; failed?: boolean };

/** The server accepts at most this many turns and this many characters per turn. */
export const MAX_TURNS = 20;
export const MAX_CHARS = 2000;

/**
 * What goes to the server for the next question: the recent conversation, with
 * failed attempts left out (they were never answered) and each turn kept
 * within the limit. A new chat is just an empty list.
 */
export function toRequest(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const turns = messages
    .filter((m) => !m.failed)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
    .slice(-MAX_TURNS);
  // A conversation has to open with the person's own words.
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

/** Starter questions; the money ones are left out for Staff, who can't see earnings. */
export function suggestions(role: "ADMIN" | "MANAGER" | "ADVISOR"): string[] {
  const common = ["How many active files?", "Aaj kitne follow-ups due hain?", "Show my latest 5 files"];
  return role === "ADVISOR" ? common : [...common, "Is mahine kitna disburse hua?", "Who handles file GCS-2026-0001?"];
}
