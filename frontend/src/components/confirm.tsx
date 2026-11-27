import { useSyncExternalStore } from "react";
import clsx from "clsx";
import { Modal } from "./modal";

// The app's own "are you sure?" window, used instead of the browser's pop-up. `await ask("Delete this?")` is true only when
// the person presses the action button; closing the window any other way is a no.

type Question = { id: number; message: string; resolve: (yes: boolean) => void };

let current: Question | null = null;
let count = 0;
const listeners = new Set<() => void>();
const show = (q: Question | null) => {
  current = q;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export function ask(message: string): Promise<boolean> {
  current?.resolve(false);
  return new Promise((resolve) => show({ id: ++count, message, resolve }));
}

/** What the action button says, taken from how the question starts, and whether it removes something. */
export function actionFor(message: string): { label: string; danger: boolean } {
  const rules: [RegExp, string, boolean][] = [
    [/^delete/i, "Delete", true],
    [/^remove/i, "Remove", true],
    [/^withdraw/i, "Withdraw link", true],
    [/^throw/i, "Discard", true],
    [/^turn off/i, "Turn off", true],
    [/^not use/i, "Don't use it", true],
    [/^go back/i, "Go back", true],
    [/^submit/i, "Submit application", false],
    [/^move/i, "Move file", false],
    [/^mark/i, "Mark received", false],
    [/^archive/i, "Archive", false],
    [/^put/i, "Put it back", false],
  ];
  const hit = rules.find(([start]) => start.test(message));
  return hit ? { label: hit[1], danger: hit[2] } : { label: "Continue", danger: false };
}

export function ConfirmHost() {
  const q = useSyncExternalStore(subscribe, () => current);
  if (!q) return null;
  const answer = (yes: boolean) => {
    q.resolve(yes);
    if (current?.id === q.id) show(null);
  };
  const { label, danger } = actionFor(q.message);
  return (
    <Modal key={q.id} title="Please confirm" onClose={() => answer(false)}>
      <p className="text-[14px] whitespace-pre-line text-ink">{q.message}</p>
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" onClick={() => answer(false)}>Cancel</button>
        <button type="button" autoFocus={!danger} className={clsx("btn-primary", danger && "!bg-red-600 hover:!bg-red-700")} onClick={() => answer(true)}>
          {label}
        </button>
      </div>
    </Modal>
  );
}
