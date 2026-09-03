import { describe, expect, it } from "vitest";
import { classifyActivity, normalizeText } from "@/lib/activity-classifier";
import { OFFICIAL_SOURCE_HOSTS } from "@/lib/official-sources";

describe("normalización del texto", () => {
  it("quita acentos y baja a minúsculas", () => {
    expect(normalizeText("Fabricación de MAQUINARIA")).toBe("fabricacion de maquinaria");
    expect(normalizeText("Diseño gráfico y traducción")).toBe("diseno grafico y traduccion");
  });

  it("tolera la ausencia de texto", () => {
    expect(normalizeText(null)).toBe("");
    expect(normalizeText(undefined)).toBe("");
  });
});

describe("reconocimiento del sector", () => {
  it("reconoce software aunque la persona escriba con acentos", () => {
    const r = classifyActivity({ description: "Quiero montar una empresa de inteligencia artificial y desarrollo web" });
    expect(r.sector).toBe("SOFTWARE_Y_SERVICIOS_DIGITALES");
    expect(r.evidence.length).toBeGreaterThan(0);
  });

  it("reconoce hostelería", () => {
    expect(classifyActivity({ description: "Abrir un bar de tapas con cocina" }).sector).toBe(
      "HOSTELERIA_Y_RESTAURACION",
    );
  });

  it("no clasifica cuando no hay señal", () => {
    const r = classifyActivity({ description: "Quiero montar algo mío" });
    expect(r.sector).toBe("SIN_DETERMINAR");
    expect(r.confidence).toBe(0);
    expect(r.nextQuestions.length).toBeGreaterThan(0);
  });

  it("no clasifica cuando dos sectores empatan", () => {
    const r = classifyActivity({ description: "Una tienda y también un restaurante" });
    expect(r.sector).toBe("SIN_DETERMINAR");
    expect(r.nextQuestions.some((q) => q.includes("más de un sector"))).toBe(true);
  });

  it("nunca da una confianza total", () => {
    const r = classifyActivity({
      description: "software saas app programacion informatica ciberseguridad datos",
    });
    expect(r.confidence).toBeLessThanOrEqual(0.85);
  });
});

describe("la regla que no se rompe: no se inventan códigos", () => {
  const casos = [
    "Bar de tapas con terraza en Palma",
    "Clínica de fisioterapia",
    "Tienda de ropa online",
    "Empresa de software",
    "Transporte de paquetería",
  ];

  it("jamás devuelve un epígrafe de IAE ni un CNAE", () => {
    for (const description of casos) {
      const r = classifyActivity({ description });
      expect(r.iaeCode).toBeNull();
      expect(r.cnaeCode).toBeNull();
      expect(r.codesNote).toContain("NO_VERIFIED_SOURCE");
    }
  });

  it("ningún texto emitido contiene algo que parezca un epígrafe", () => {
    for (const description of casos) {
      const r = classifyActivity({ description, hasPremises: true, willHireWorkers: true });
      const emitido = [
        r.regulatoryReason,
        r.codesNote,
        ...r.obligationsToVerify.map((o) => `${o.topic} ${o.why}`),
        ...r.nextQuestions,
      ].join(" ");
      // Un epígrafe se escribe como 501.1, 673.2 o similar. No debe aparecer.
      expect(emitido).not.toMatch(/\b\d{3}\.\d\b/);
    }
  });
});

describe("obligaciones a verificar", () => {
  it("toda obligación lleva autoridad y una URL de sede oficial", () => {
    const r = classifyActivity({
      description: "Bar de tapas",
      hasPremises: true,
      willHireWorkers: true,
      euOperations: true,
    });
    expect(r.obligationsToVerify.length).toBeGreaterThan(3);
    for (const o of r.obligationsToVerify) {
      expect(o.authority.length).toBeGreaterThan(0);
      expect(o.status).toBe("PENDING_VERIFICATION");
      const host = new URL(o.sourceUrl).hostname;
      expect(OFFICIAL_SOURCE_HOSTS.has(host)).toBe(true);
    }
  });

  it("siempre plantea el epígrafe y la declaración censal", () => {
    const r = classifyActivity({ description: "Consultoria de marketing" });
    const temas = r.obligationsToVerify.map((o) => o.topic);
    expect(temas).toContain("Epígrafe del IAE");
    expect(temas).toContain("Declaración censal (modelo 036)");
  });

  it("no menciona el modelo 037 en ningún sitio", () => {
    const r = classifyActivity({ description: "Tienda de ropa", hasPremises: true });
    const emitido = JSON.stringify(r);
    expect(emitido).not.toContain("037");
  });

  it("solo pide licencia municipal si hay local", () => {
    const conLocal = classifyActivity({ description: "Tienda de ropa", hasPremises: true });
    const sinLocal = classifyActivity({ description: "Tienda de ropa", hasPremises: false });
    expect(conLocal.obligationsToVerify.some((o) => o.topic.includes("Licencia municipal"))).toBe(true);
    expect(sinLocal.obligationsToVerify.some((o) => o.topic.includes("Licencia municipal"))).toBe(false);
  });

  it("solo habla de operaciones intracomunitarias si las hay", () => {
    const con = classifyActivity({ description: "Empresa de software", euOperations: true });
    const sin = classifyActivity({ description: "Empresa de software", euOperations: false });
    expect(con.obligationsToVerify.some((o) => o.topic.includes("intracomunitarias"))).toBe(true);
    expect(sin.obligationsToVerify.some((o) => o.topic.includes("intracomunitarias"))).toBe(false);
  });
});

describe("exposición regulatoria", () => {
  it("un local siempre obliga a comprobar", () => {
    const r = classifyActivity({ description: "Empresa de software", hasPremises: true });
    expect(r.regulatoryExposure).toBe("REQUIERE_COMPROBACION");
  });

  it("los sectores con régimen propio obligan a comprobar", () => {
    for (const description of ["Clínica de fisioterapia", "Apartamento turístico", "Transporte de mercancías"]) {
      expect(classifyActivity({ description }).regulatoryExposure).toBe("REQUIERE_COMPROBACION");
    }
  });

  it("sin indicios no afirma que no haya regulación", () => {
    const r = classifyActivity({ description: "Empresa de software", hasPremises: false });
    expect(r.regulatoryExposure).toBe("SIN_INDICIOS");
    expect(r.regulatoryReason).toContain("no es lo mismo");
  });
});
