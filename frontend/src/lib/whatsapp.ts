export type MessageStatus = "RECEIVED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
export type Sender = "CUSTOMER" | "STAFF" | "BOT" | "SYSTEM";

export type Conversation = {
  id: string;
  phone: string;
  name: string | null;
  kind: "CUSTOMER" | "UNKNOWN";
  needsHuman: boolean;
  unreadCount: number;
  windowOpen: boolean;
  lastInboundAt: string | null;
  lastMessageAt: string;
  lastPreview: string | null;
  lead: { id: string; leadNo: number; name: string } | null;
  application: { id: string; applicationNo: string } | null;
};

export type ConversationList = {
  items: Conversation[];
  total: number;
  page: number;
  pageSize: number;
  needsHuman: number;
};

export type WhatsAppMessage = {
  id: string;
  direction: "IN" | "OUT";
  sender: Sender;
  type: string;
  body: string | null;
  templateName: string | null;
  status: MessageStatus;
  error: string | null;
  createdAt: string;
};

export type MetaStatus = "NOT_SUBMITTED" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED";

export const META_STATUS_LABEL: Record<MetaStatus, string> = {
  NOT_SUBMITTED: "Not submitted",
  PENDING: "Pending review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PAUSED: "Paused",
};

export type Trigger =
  | "LEAD_CREATED"
  | "FILE_STAGE_CHANGED"
  | "FILE_REJECTED"
  | "SANCTION_APPROVED"
  | "DISBURSAL_COMPLETED"
  | "MORNING_BRIEF"
  | "EVENING_BRIEF";

export type Recipient = "CUSTOMER" | "EMPLOYEE";

export type NotificationTemplate = {
  id: string;
  name: string;
  code: string;
  trigger: Trigger;
  recipient: Recipient;
  body: string;
  language: string;
  active: boolean;
  metaStatus: MetaStatus;
  metaReason: string | null;
  createdAt: string;
};

export type TriggerInfo = {
  value: Trigger;
  label: string;
  description: string;
  recipients: Recipient[];
  variables: { key: string; label: string; example: string }[];
};

export type TemplateMeta = {
  triggers: TriggerInfo[];
  provider: { kind: "meta" | "sandbox" | "none"; requiresApproval: boolean };
};

export type NotificationLog = {
  id: string;
  trigger: Trigger;
  recipient: Recipient;
  templateCode: string | null;
  toPhone: string | null;
  toName: string | null;
  status: "SENT" | "FAILED" | "SKIPPED";
  reason: string | null;
  createdAt: string;
};

export type SetupStatus = {
  connection: {
    state: "not_configured" | "connected" | "error";
    provider: "meta" | "sandbox" | "none";
    phoneNumber?: string;
    verifiedName?: string;
    quality?: string;
    codeVerification?: string;
    phoneNumberId?: string;
    wabaId?: string;
    message?: string;
  };
  credentials: Record<"accessToken" | "phoneNumberId" | "wabaId" | "appSecret" | "verifyToken", boolean>;
  webhookPath: string;
  templates: Partial<Record<MetaStatus, number>>;
  requiresApproval: boolean;
};

const VARIABLE = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

/** Placeholders in order of first appearance. */
export function extractVariables(body: string): string[] {
  const seen: string[] = [];
  for (const m of body.matchAll(VARIABLE)) if (!seen.includes(m[1])) seen.push(m[1]);
  return seen;
}

/** The wording with sample values filled in — what the editor shows as a preview. */
export function renderPreview(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE, (_m, key: string) => values[key] ?? `{{${key}}}`);
}

/** "9820592765" → "+91 98205 92765"; anything else is shown as typed. */
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

/**
 * Time left in WhatsApp's 24-hour reply window, in words — or null once it has closed.
 */
export function windowLeft(lastInboundAt: string | null, now: number = Date.now()): string | null {
  if (!lastInboundAt) return null;
  const left = new Date(lastInboundAt).getTime() + 24 * 3600_000 - now;
  if (left <= 0) return null;
  const hours = Math.floor(left / 3600_000);
  const minutes = Math.floor((left % 3600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

export const TRIGGER_LABEL: Record<Trigger, string> = {
  LEAD_CREATED: "Lead created",
  FILE_STAGE_CHANGED: "File stage changed",
  FILE_REJECTED: "File rejected",
  SANCTION_APPROVED: "Sanction approved",
  DISBURSAL_COMPLETED: "Disbursal completed",
  MORNING_BRIEF: "Morning brief",
  EVENING_BRIEF: "Evening brief",
};

export const SENDER_LABEL: Record<Sender, string> = {
  CUSTOMER: "Customer",
  STAFF: "Team",
  BOT: "Chatbot",
  SYSTEM: "Automatic",
};
