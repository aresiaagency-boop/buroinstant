import { describe, expect, it } from "vitest";
import { BusinessDataIngestionService, detectContradictions } from "@/lib/ingestion";
import type { OrbeInboundMessage } from "@/types/domain";

function message(text: string): OrbeInboundMessage {
  return {
    channel: "WHATSAPP",
    inputType: "VOICE",
    text,
    sourceTimestamp: "2026-09-02T12:00:00.000Z",
  };
}

describe("BusinessDataIngestionService", () => {
  it("turns conversational Spanish into risk-labelled candidate fields", () => {
    const result = new BusinessDataIngestionService().process(
      message("Soy yo solo, quiero montar una SL de software y trabajar desde Palma."),
    );
    expect(result.extractedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "number_of_founders", value: 1, status: "PROPOSED" }),
        expect.objectContaining({ field: "preferred_legal_form", value: "SL" }),
        expect.objectContaining({ field: "municipality", value: "Palma" }),
      ]),
    );
  });

  it("requires explicit confirmation for administrator data", () => {
    const result = new BusinessDataIngestionService().process(
      message("Seré administrador único y el cargo no será retribuido."),
    );
    expect(result.extractedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "administrator_structure", risk: "HIGH_RISK", requiresConfirmation: true }),
        expect.objectContaining({ field: "administrator_paid", value: false, status: "NEEDS_CONFIRMATION" }),
      ]),
    );
  });

  it("detects contradictions instead of silently overwriting data", () => {
    const result = new BusinessDataIngestionService().process(message("Al final seremos 2 socios."));
    expect(detectContradictions({ number_of_founders: 1 }, result.extractedFields)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "DATA_CONFLICT", field: "number_of_founders" })]),
    );
  });
});
