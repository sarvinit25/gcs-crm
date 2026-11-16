// The customer's application form has no staff login. The link's token is one credential; when the applicant has an
// email on file, the code emailed to them is the second: it gives a pass that is kept for this tab only and sent with
// every call, so a forwarded link on its own opens nothing.

const BASE = "/crm/api/public/apply";
const PASS_KEY = (token: string) => `gcs_form_pass_${token.slice(0, 12)}`;

export const formPass = {
  get: (token: string): string | null => {
    try {
      return sessionStorage.getItem(PASS_KEY(token));
    } catch {
      return null;
    }
  },
  set: (token: string, pass: string) => {
    try {
      sessionStorage.setItem(PASS_KEY(token), pass);
    } catch {
      /* private window: the pass just will not survive a reload */
    }
  },
  clear: (token: string) => {
    try {
      sessionStorage.removeItem(PASS_KEY(token));
    } catch {
      /* nothing to clear */
    }
  },
};

export class FormApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
    public code?: string,
  ) {
    super(message);
  }
}

export async function formApi<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const pass = formPass.get(token);
  const res = await fetch(`${BASE}/${encodeURIComponent(token)}${path}`, {
    ...init,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...(pass ? { "x-form-session": pass } : {}), ...init.headers },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    // The pass ran out or was never there: drop it and start again from the code screen.
    if (res.status === 403 && body?.code === "SESSION") {
      formPass.clear(token);
      window.location.reload();
    }
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new FormApiError(res.status, message ?? "Something went wrong — please try again", body?.fields, body?.code);
  }
  return body as T;
}
