// Mirrors lib/partner-api.ts but for the borrower portal: a separate token
// key so a borrower session never collides with a staff or partner session
// in the same browser, and a 401 sends the visitor to the borrower login.

const BASE = "/crm/api";
const TOKEN_KEY = "gcs_crm_borrower_token";

export const borrowerTokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class BorrowerApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function borrowerApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = borrowerTokenStore.get();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...init.headers,
    },
  });

  // A wrong code on the sign-in form is a 401 too: show the server's message instead of reloading the page.
  if (res.status === 401 && !path.startsWith("/borrower/auth/")) {
    borrowerTokenStore.clear();
    window.location.href = "/crm/track-login";
    throw new BorrowerApiError(401, "Session expired");
  }

  const body = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    throw new BorrowerApiError(res.status, message ?? "Something went wrong");
  }
  return body as T;
}
