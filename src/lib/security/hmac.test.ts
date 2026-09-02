import { describe, expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "@/lib/security/hmac";

describe("n8n webhook HMAC", () => {
  it("accepts a valid recent signature", () => {
    const now = Date.parse("2026-09-02T12:00:00.000Z");
    const timestamp = new Date(now).toISOString();
    const rawBody = '{"event":"messages.upsert"}';
    const secret = "test-secret-with-sufficient-entropy";
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody,
        signature: signWebhookPayload(secret, timestamp, rawBody),
        now,
      }),
    ).toBe(true);
  });

  it("rejects replays outside the five minute window", () => {
    const timestamp = "2026-09-02T12:00:00.000Z";
    const secret = "test-secret";
    const rawBody = "{}";
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody,
        signature: signWebhookPayload(secret, timestamp, rawBody),
        now: Date.parse("2026-09-02T12:06:00.000Z"),
      }),
    ).toBe(false);
  });

  it("rejects altered payloads", () => {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();
    const secret = "test-secret";
    expect(
      verifyWebhookSignature({
        secret,
        timestamp,
        rawBody: '{"changed":true}',
        signature: signWebhookPayload(secret, timestamp, '{"changed":false}'),
        now,
      }),
    ).toBe(false);
  });
});
