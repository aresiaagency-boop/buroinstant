export type OrbState =
  | "idle"
  | "listening"
  | "receiving"
  | "thinking"
  | "consulting_official_source"
  | "validating"
  | "manifesting"
  | "success"
  | "warning"
  | "blocked";

export type WorkspaceRole =
  | "OWNER"
  | "ADMIN"
  | "FOUNDER"
  | "ADVISOR"
  | "ACCOUNTANT"
  | "LAWYER"
  | "COLLABORATOR"
  | "VIEWER";

export type Actor = {
  userId: string;
  email: string;
  name: string;
  mode: "oauth" | "local_preview";
};

export type OrbeInboundMessage = {
  channel: "WEB" | "WHATSAPP";
  inputType: "TEXT" | "VOICE" | "IMAGE" | "DOCUMENT";
  userId?: string;
  workspaceId?: string;
  projectId?: string;
  externalIdentity?: {
    provider: "EVOLUTION_API";
    instance: string;
    phone: string;
    messageId: string;
  };
  text: string;
  sourceTimestamp: string;
};

export type FieldRisk = "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK";
export type FieldStatus = "APPLIED" | "PROPOSED" | "NEEDS_CONFIRMATION";

export type ExtractedField = {
  field: string;
  value: unknown;
  confidence: number;
  source: "WEB_TEXT" | "WEB_VOICE" | "WHATSAPP_TEXT" | "WHATSAPP_VOICE";
  risk: FieldRisk;
  status: FieldStatus;
  requiresConfirmation: boolean;
};

export type OfficialSourceReference = {
  sourceTitle: string;
  sourceUrl: string;
  authority: string;
  fetchedAt: string | null;
  effectiveDate?: string;
  lastVerifiedAt: string | null;
  confidence: number;
  informationalOnly: true;
};
