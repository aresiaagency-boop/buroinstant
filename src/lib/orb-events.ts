import type { OrbState } from "@/types/domain";

export const ORB_EVENT = "buroinstant:orb";

export type OrbManifestDetail = {
  action: string;
  intensity: "subtle" | "medium" | "high";
  state: OrbState;
  message: string;
};

export function emitOrb(detail: OrbManifestDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OrbManifestDetail>(ORB_EVENT, { detail }));
}

export const channelEventToOrbState: Record<string, OrbState> = {
  WHATSAPP_MESSAGE_RECEIVED: "receiving",
  VOICE_NOTE_RECEIVED: "listening",
  VOICE_TRANSCRIBED: "thinking",
  DATA_EXTRACTED: "validating",
  DATA_CONFIRMED: "validating",
  DATA_APPLIED: "manifesting",
};
