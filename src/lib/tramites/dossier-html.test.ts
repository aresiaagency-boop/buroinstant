import { describe, expect, it } from "vitest";

import { buildCarpeta, siguientePaso } from "@/lib/tramites/dossier";
import { escaparHtml, renderCarpetaHtml } from "@/lib/tramites/dossier-html";
import type { CarpetaCompleta } from "@/lib/tramites/dossier-repository";
import type { DerivedTask } from "@/lib/task-engine";

function carpetaCon(overrides: {
  nombreProyecto?: string;
  nombreDocumento?: string;
  sourceUrl?: string;
  descripcion?: string;
}): CarpetaCompleta {
  const task: DerivedTask = {
    code: "CENSAL",
    title: "Alta censal",
    detail: overrides.descripcion ?? "Declaración censal de alta.",
    authority: "AEAT",
    status: "READY",
    priority: 100,
    dependencyCodes: [],
    requiredDocuments: ["TAX"],
    verificationMethod: "Justificante sellado.",
    sourceKind: "OFICIAL",
    sourceUrl: overrides.sourceUrl,
  };
  const base = buildCarpeta({
    task,
    itinerario: [task],
    profile: { business_description: "Bicicletas", municipality: "Palma", preferred_legal_form: "SL" },
    documentos: overrides.nombreDocumento
      ? [{ id: "doc-1", category: "TAX", displayName: overrides.nombreDocumento }]
      : [],
  });
  return {
    ...base,
    proyecto: { id: "p-1", name: overrides.nombreProyecto ?? "Mi empresa" },
    siguientePaso: siguientePaso(base),
    generadaEn: "2026-09-07T10:00:00.000Z",
  };
}

describe("nada de lo que escribe una persona se interpola en crudo", () => {
  it("escapa los cinco caracteres que importan", () => {
    expect(escaparHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("un nombre de proyecto con etiquetas no crea etiquetas", () => {
    const html = renderCarpetaHtml(carpetaCon({ nombreProyecto: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("un nombre de documento venido de WhatsApp tampoco", () => {
    const html = renderCarpetaHtml(carpetaCon({ nombreDocumento: '"><img src=x onerror=alert(1)>' }));
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("la descripción del trámite se escapa igual", () => {
    const html = renderCarpetaHtml(carpetaCon({ descripcion: "5 < 6 & 7 > 6" }));
    expect(html).toContain("5 &lt; 6 &amp; 7 &gt; 6");
  });
});

describe("la fuente sólo se enlaza si es una URL de verdad", () => {
  it("enlaza https", () => {
    const html = renderCarpetaHtml(carpetaCon({ sourceUrl: "https://sede.agenciatributaria.gob.es/" }));
    expect(html).toContain('href="https://sede.agenciatributaria.gob.es/"');
  });

  it("no enlaza javascript:", () => {
    const html = renderCarpetaHtml(carpetaCon({ sourceUrl: "javascript:alert(1)" }));
    expect(html).not.toContain("javascript:");
    expect(html).toContain("Sin enlace a fuente oficial verificada");
  });

  it("sin fuente lo dice, no se lo inventa", () => {
    const html = renderCarpetaHtml(carpetaCon({}));
    expect(html).toContain("Sin enlace a fuente oficial verificada");
  });
});

describe("la carpeta impresa no afirma que el trámite esté hecho", () => {
  it("el pie lo deja por escrito", () => {
    const html = renderCarpetaHtml(carpetaCon({ sourceUrl: "https://sede.agenciatributaria.gob.es/" }));
    expect(html).toContain("ni acredita que el trámite esté presentado");
    expect(html).toContain("no es asesoramiento jurídico");
  });

  it("no lleva ningún script propio", () => {
    const html = renderCarpetaHtml(carpetaCon({ sourceUrl: "https://sede.agenciatributaria.gob.es/" }));
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
  });
});
