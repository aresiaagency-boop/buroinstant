import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_SECONDS = 300;

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function verifyWebhookSignature(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
}) {
  if (!input.timestamp || !input.signature) return false;
  const timestampMs = Date.parse(input.timestamp);
  if (!Number.isFinite(timestampMs)) return false;

  const now = input.now ?? Date.now();
  if (Math.abs(now - timestampMs) > MAX_CLOCK_SKEW_SECONDS * 1_000) return false;

  const expected = Buffer.from(
    signWebhookPayload(input.secret, input.timestamp, input.rawBody),
    "utf8",
  );
  const received = Buffer.from(input.signature.replace(/^sha256=/, ""), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function verifyMachineBearer(secret: string, authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length).trim();
  if (!supplied) return false;

  const expected = Buffer.from(secret, "utf8");
  const received = Buffer.from(supplied, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
