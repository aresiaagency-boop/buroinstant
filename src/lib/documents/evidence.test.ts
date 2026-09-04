import { describe, expect, it } from "vitest";

import { canConfirm, effectsOf, evidenceLine, type EvidenceDocument } from "@/lib/documents/evidence";
import { deriveTasks, type DerivedTask } from "@/lib/task-engine";

const ESCRITURA: EvidenceDocument = {
  id: "doc-1",
  category: "NOTARY",
  displayName: "escritura.pdf",
  contentHash: "a".repeat(64),
};
const CENSAL: EvidenceDocument = {
  id: "doc-2",
  category: "TAX",
  displayName: "modelo-036.pdf",
  contentHash: "b".repeat(64),
};
const DNI: EvidenceDocument = {
  id: "doc-3",
  category: "IDENTITY",
  displayName: "dni.pdf",
  contentHash: "c".repeat(64),
};

const SOCIEDAD = deriveTasks({ legalForm: "SL", founders: 2 });
const AUTONOMO = deriveTasks({ legalForm: "AUTONOMO" });

describe("qué trámites toca un documento", () => {
  it("la escritura mueve el trámite de la escritura", () => {
    const efectos = effectsOf(ESCRITURA, SOCIEDAD);
    expect(efectos.map((e) => e.taskCode)).toContain("NOTARY");
  });

  it("el DNI mueve el trámite de identidad", () => {
    expect(effectsOf(DNI, SOCIEDAD).map((e) => e.taskCode)).toContain("IDENTITY");
  });

  it("no toca trámites que no piden ese documento", () => {
    const codigos = effectsOf(ESCRITURA, SOCIEDAD).map((e) => e.taskCode);
    expect(codigos).not.toContain("COMPANY_NAME");
    expect(codigos).not.toContain("CAPITAL");
    expect(codigos).not.toContain("ACTIVITY_CLASSIFICATION");
  });

  it("un documento de sociedad no toca nada en el itinerario de un autónomo", () => {
    expect(effectsOf(ESCRITURA, AUTONOMO)).toHaveLength(0);
  });

  it("un mismo documento puede tocar varios trámites", () => {
    const efectos = effectsOf(CENSAL, SOCIEDAD);
    expect(efectos.length).toBeGreaterThan(1);
    expect(efectos.map((e) => e.taskCode)).toContain("CENSAL_036");
  });
});

describe("un documento nunca da por hecho un trámite", () => {
  it("ningún efecto deja el trámite en COMPLETED", () => {
    for (const documento of [ESCRITURA, CENSAL, DNI]) {
      for (const efecto of effectsOf(documento, SOCIEDAD)) {
        expect(efecto.nextStatus, `${documento.category} → ${efecto.taskCode}`).not.toBe("COMPLETED");
      }
    }
  });

  it("lo que depende de un tercero queda esperando a la Administración", () => {
    const registro = effectsOf({ ...ESCRITURA, category: "REGISTRY" }, SOCIEDAD).find(
      (e) => e.taskCode === "REGISTRY",
    );
    expect(registro?.nextStatus).toBe("WAITING_AUTHORITY");
    expect(registro?.readyToConfirm).toBe(false);
    expect(registro?.confirmationPrompt).toContain("Registro Mercantil");
  });

  it("lo que acredita el propio papel queda listo para confirmar", () => {
    const notaria = effectsOf(ESCRITURA, SOCIEDAD).find((e) => e.taskCode === "NOTARY");
    expect(notaria?.nextStatus).toBe("IN_PROGRESS");
    expect(notaria?.readyToConfirm).toBe(true);
    expect(notaria?.confirmationPrompt).toContain("escritura.pdf");
  });

  it("no reabre un trámite ya cerrado", () => {
    const cerrado: DerivedTask[] = SOCIEDAD.map((t) =>
      t.code === "NOTARY" ? { ...t, status: "COMPLETED" as const } : t,
    );
    expect(effectsOf(ESCRITURA, cerrado).map((e) => e.taskCode)).not.toContain("NOTARY");
  });

  it("no activa un trámite marcado como no aplicable", () => {
    const noAplica: DerivedTask[] = SOCIEDAD.map((t) =>
      t.code === "NOTARY" ? { ...t, status: "NOT_APPLICABLE" as const } : t,
    );
    expect(effectsOf(ESCRITURA, noAplica).map((e) => e.taskCode)).not.toContain("NOTARY");
  });

  it("cada efecto explica qué falta, en castellano llano", () => {
    for (const efecto of effectsOf(CENSAL, SOCIEDAD)) {
      expect(efecto.confirmationPrompt.length).toBeGreaterThan(30);
      expect(efecto.confirmationPrompt).not.toMatch(/[A-Z_]{6,}/);
    }
  });
});

describe("la línea de evidencia", () => {
  it("identifica el documento y su huella sin repetir el contenido", () => {
    const linea = evidenceLine(ESCRITURA, new Date("2026-09-04T10:00:00Z"));
    expect(linea).toContain("escritura.pdf");
    expect(linea).toContain("2026-09-04");
    expect(linea).toContain("sha256");
    // La huella va recortada: basta para identificar, no es el documento.
    expect(linea).not.toContain(ESCRITURA.contentHash);
    expect(linea).toContain(ESCRITURA.contentHash.slice(0, 16));
  });

  it("cabe en el campo de evidencia del itinerario", () => {
    const largo = evidenceLine(
      { ...ESCRITURA, displayName: `${"nombre-larguisimo-".repeat(6)}.pdf` },
      new Date("2026-09-04T10:00:00Z"),
    );
    expect(largo.length).toBeLessThanOrEqual(500);
  });
});

describe("cuándo se puede confirmar", () => {
  it("no se confirma un trámite sin documento aportado", () => {
    expect(canConfirm({ status: "IN_PROGRESS" }, 0)).toBe(false);
  });

  it("se confirma con al menos un documento", () => {
    expect(canConfirm({ status: "IN_PROGRESS" }, 1)).toBe(true);
    expect(canConfirm({ status: "WAITING_AUTHORITY" }, 2)).toBe(true);
  });

  it("no se reconfirma lo ya hecho ni lo que no aplica", () => {
    expect(canConfirm({ status: "COMPLETED" }, 3)).toBe(false);
    expect(canConfirm({ status: "NOT_APPLICABLE" }, 3)).toBe(false);
  });
});
