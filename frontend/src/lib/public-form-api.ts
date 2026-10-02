// The customer's application form has no login: the link's token is the credential,
// so these calls carry it in the path and nothing else.

const BASE = "/crm/api/public/apply";

export class FormApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export async function formApi<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${BASE}/${encodeURIComponent(token)}${path}`, {
    ...init,
    headers: { ...(isForm ? {} : { "Content-Type": "application/json" }), ...init.headers },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new FormApiError(res.status, message ?? "Something went wrong — please try again", body?.fields);
  }
  return body as T;
}
