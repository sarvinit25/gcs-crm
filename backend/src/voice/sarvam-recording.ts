// Where a call's audio lives at Sarvam. The webhook carries no link, so the CRM fetches the file itself with the workspace key.

export type SarvamIds = { orgId: string; workspaceId: string };

/** The call's ids as the webhook sent them, or null when either is missing or not a plain id. */
export function callIds(payload: unknown): { appId: string; interactionId: string } | null {
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const appId = typeof p.app_id === "string" ? p.app_id.trim() : "";
  const interactionId = typeof p.interaction_id === "string" ? p.interaction_id.trim() : "";
  // Letters, digits and a few separators only, so nothing odd can end up in the web address we call.
  const part = /^[A-Za-z0-9._:-]+$/;
  const plain = (v: string) => v.split("/").every((s) => part.test(s) && s !== "." && s !== "..");
  return plain(appId) && !appId.includes("/") && plain(interactionId) ? { appId, interactionId } : null;
}

/** The web address of one call's recording. Each part of the call id is encoded; the slash between them stays. */
export function recordingUrl(ids: SarvamIds, appId: string, interactionId: string): string {
  const interaction = interactionId.split("/").map(encodeURIComponent).join("/");
  return `https://apps.sarvam.ai/api/analytics/v1/${encodeURIComponent(ids.orgId)}/${encodeURIComponent(ids.workspaceId)}/${encodeURIComponent(appId)}/recordings/${interaction}`;
}
