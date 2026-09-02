import { describe, expect, it } from "vitest";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";

describe("normalizeWhatsAppPhone", () => {
  it("removes the WhatsApp domain without changing the country code", () => {
    expect(normalizeWhatsAppPhone("34600111222@s.whatsapp.net")).toBe("34600111222");
    expect(normalizeWhatsAppPhone("5491112345678@s.whatsapp.net")).toBe("5491112345678");
  });

  it("rejects implausible identifiers", () => {
    expect(() => normalizeWhatsAppPhone("123")).toThrow("INVALID_WHATSAPP_PHONE");
  });
});
