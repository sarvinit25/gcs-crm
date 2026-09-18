/**
 * Every configurable value in one place. Each entry replaces something that
 * would otherwise be hardcoded, so adding a setting here is the only step
 * needed to make it editable — the API and the settings screen are generated
 * from this registry.
 */

export type SettingType = "string" | "text" | "number" | "boolean" | "list" | "email" | "phone";

export type SettingDef = {
  key: string;
  group: string;
  label: string;
  help?: string;
  type: SettingType;
  default: unknown;
  min?: number;
  max?: number;
  /** Shown on the public website or in customer-facing output. */
  publicFacing?: boolean;
};

export const SETTING_GROUPS = [
  "Organisation",
  "Pipeline",
  "Documents",
  "Numbering",
  "Commissions",
  "Security",
] as const;

export const SETTINGS: SettingDef[] = [
  // ── Organisation ──────────────────────────────────────────
  {
    key: "org.name",
    group: "Organisation",
    label: "Trading name",
    type: "string",
    default: "Growth Capital Services",
    publicFacing: true,
  },
  {
    key: "org.legalName",
    group: "Organisation",
    label: "Registered legal name",
    help: "As it appears on sanction letters and agreements.",
    type: "string",
    default: "Growth Capital Services",
  },
  {
    key: "org.establishedYear",
    group: "Organisation",
    label: "Established",
    type: "number",
    default: 2017,
    min: 1900,
    max: 2100,
  },
  { key: "org.pan", group: "Organisation", label: "PAN", type: "string", default: "" },
  { key: "org.gstin", group: "Organisation", label: "GSTIN", type: "string", default: "" },
  {
    key: "org.address",
    group: "Organisation",
    label: "Registered address",
    type: "text",
    default: "",
  },
  {
    key: "org.phone",
    group: "Organisation",
    label: "Primary phone",
    type: "phone",
    default: "",
    publicFacing: true,
  },
  {
    key: "org.email",
    group: "Organisation",
    label: "Primary email",
    type: "email",
    default: "",
    publicFacing: true,
  },
  {
    key: "org.whatsapp",
    group: "Organisation",
    label: "WhatsApp number",
    type: "phone",
    default: "",
    publicFacing: true,
  },
  {
    key: "org.cities",
    group: "Organisation",
    label: "Cities served",
    help: "One per line. Used for city dropdowns.",
    type: "list",
    default: ["Mumbai", "Thane", "Navi Mumbai", "Pune"],
    publicFacing: true,
  },

  // ── Pipeline ──────────────────────────────────────────────
  {
    key: "pipeline.leadSources",
    group: "Pipeline",
    label: "Lead sources",
    help: "Offered when staff create a lead. Website forms send their own source regardless.",
    type: "list",
    default: [
      "Walk-in",
      "Referral",
      "Website",
      "WhatsApp",
      "Phone enquiry",
      "Sourcing partner",
      "Repeat customer",
    ],
  },
  {
    key: "pipeline.defaultFollowUpDays",
    group: "Pipeline",
    label: "Default follow-up interval (days)",
    help: "Pre-fills the next follow-up date when logging a call.",
    type: "number",
    default: 3,
    min: 1,
    max: 90,
  },
  {
    key: "pipeline.stalledAfterDays",
    group: "Pipeline",
    label: "Treat a case as stalled after (days)",
    help: "Drives the stalled-cases list in Reports.",
    type: "number",
    default: 30,
    min: 7,
    max: 180,
  },
  {
    key: "pipeline.autoAssignToCreator",
    group: "Pipeline",
    label: "Advisors own the leads they create",
    type: "boolean",
    default: true,
  },
  {
    key: "pipeline.sanctionSanityMultiple",
    group: "Pipeline",
    label: "Reject sanctions above this multiple of the requested amount",
    help: "Catches a typo like an extra zero. Set higher to allow top-ups well above the ask.",
    type: "number",
    default: 2,
    min: 1,
    max: 20,
  },

  // ── Documents ─────────────────────────────────────────────
  {
    key: "documents.categories",
    group: "Documents",
    label: "Document categories",
    type: "list",
    default: [
      "KYC",
      "Income proof",
      "Bank statement",
      "Property papers",
      "Business proof",
      "Sanction letter",
      "Other",
    ],
  },
  {
    key: "documents.maxUploadMb",
    group: "Documents",
    label: "Maximum upload size (MB)",
    type: "number",
    default: 15,
    min: 1,
    max: 100,
  },
  {
    key: "documents.downloadLinkMinutes",
    group: "Documents",
    label: "Download link validity (minutes)",
    help: "How long a generated document link stays usable.",
    type: "number",
    default: 5,
    min: 1,
    max: 60,
  },

  // ── Numbering ─────────────────────────────────────────────
  {
    key: "numbering.applicationPrefix",
    group: "Numbering",
    label: "Application number prefix",
    help: "GCS gives GCS-2026-0042. Changing this does not renumber existing files.",
    type: "string",
    default: "GCS",
  },
  {
    key: "numbering.applicationPadding",
    group: "Numbering",
    label: "Application number digits",
    type: "number",
    default: 4,
    min: 3,
    max: 8,
  },
  {
    key: "numbering.includeYear",
    group: "Numbering",
    label: "Include the year in application numbers",
    type: "boolean",
    default: true,
  },

  // ── Commissions ───────────────────────────────────────────
  {
    key: "commissions.defaultGrossRate",
    group: "Commissions",
    label: "Default commission rate from lenders (%)",
    help: "Pre-fills a new commission; each case can still be set individually.",
    type: "number",
    default: 1,
    min: 0,
    max: 100,
  },
  {
    key: "commissions.defaultPartnerShare",
    group: "Commissions",
    label: "Default sourcing-partner share (%)",
    help: "Used when a partner has no rate of their own.",
    type: "number",
    default: 20,
    min: 0,
    max: 100,
  },

  // ── Security ──────────────────────────────────────────────
  {
    key: "security.sessionHours",
    group: "Security",
    label: "Sign-in session length (hours)",
    help: "Applies to sessions started after the change.",
    type: "number",
    default: 12,
    min: 1,
    max: 168,
  },
  {
    key: "security.minPasswordLength",
    group: "Security",
    label: "Minimum staff password length",
    type: "number",
    default: 10,
    min: 8,
    max: 64,
  },
];

export const SETTINGS_BY_KEY = new Map(SETTINGS.map((s) => [s.key, s]));

export const DEFAULTS = Object.fromEntries(SETTINGS.map((s) => [s.key, s.default]));
