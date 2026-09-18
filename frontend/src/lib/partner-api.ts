// Mirrors lib/api.ts but for the partner portal: a separate token key so a
// partner session and a staff session in the same browser never collide, and
// a 401 sends the visitor to the partner login page, not the staff one.

const BASE = "/crm/api";
const TOKEN_KEY = "gcs_crm_partner_token";

export const partnerTokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class PartnerApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function partnerApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = partnerTokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });

  if (res.status === 401) {
    partnerTokenStore.clear();
    window.location.href = "/crm/partner-login";
    throw new PartnerApiError(401, "Session expired");
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new PartnerApiError(res.status, message ?? "Something went wrong");
  }
  return body as T;
}
