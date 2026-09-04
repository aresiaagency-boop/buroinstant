import { describe, expect, it } from "vitest";

import {
  CATEGORY_LABEL,
  DOCUMENT_CATEGORIES,
  MAX_DOCUMENT_BYTES,
  detectType,
  requirementsFor,
  sanitizeFileName,
  validateUpload,
} from "@/lib/documents/validation";

const pdf = (extra = "cuerpo del documento") => Buffer.from(`%PDF-1.7\n${extra}`, "latin1");
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("datos de imagen"),
]);
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("datos jpeg")]);

describe("detección del tipo por los bytes", () => {
  it("reconoce PDF, PNG y JPG", () => {
    expect(detectType(pdf())?.mime).toBe("application/pdf");
    expect(detectType(png)?.mime).toBe("image/png");
    expect(detectType(jpg)?.mime).toBe("image/jpeg");
  });

  it("reconoce WEBP sólo con la marca completa", () => {
    const bueno = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPresto")]);
    const malo = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEresto")]);
    expect(detectType(bueno)?.mime).toBe("image/webp");
    expect(detectType(malo)).toBeNull();
  });

  it("distingue docx de xlsx dentro del ZIP", () => {
    const zip = (marker: string) =>
      Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(`......${marker}document.xml`)]);
    expect(detectType(zip("word/"))?.extension).toBe("docx");
    expect(detectType(zip("xl/"))?.extension).toBe("xlsx");
  });

  it("un ZIP cualquiera no pasa por documento ofimático", () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("cualquier/cosa.txt")]);
    expect(detectType(zip)).toBeNull();
  });

  it("no acepta un ejecutable ni texto plano", () => {
    expect(detectType(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // .exe
    expect(detectType(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBeNull(); // ELF
    expect(detectType(Buffer.from("<?php system($_GET[0]); ?>"))).toBeNull();
    expect(detectType(Buffer.from("<script>alert(1)</script>"))).toBeNull();
  });
});

describe("validación de la subida", () => {
  it("acepta un PDF con categoría válida", () => {
    const resultado = validateUpload({ bytes: pdf(), declaredName: "escritura.pdf", category: "NOTARY" });
    expect(resultado.ok).toBe(true);
    if (resultado.ok) expect(resultado.type.extension).toBe("pdf");
  });

  it("no se fía del tipo declarado: un ejecutable llamado .pdf se rechaza", () => {
    const resultado = validateUpload({
      bytes: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04]),
      declaredName: "escritura.pdf",
      category: "NOTARY",
    });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe("DOCUMENT_TYPE_NOT_ALLOWED");
  });

  it("rechaza el archivo vacío y el demasiado grande", () => {
    const vacio = validateUpload({ bytes: Buffer.alloc(2), declaredName: "a.pdf", category: "TAX" });
    expect(vacio.ok).toBe(false);
    if (!vacio.ok) expect(vacio.error).toBe("DOCUMENT_EMPTY");

    const grande = validateUpload({
      bytes: Buffer.concat([pdf(), Buffer.alloc(MAX_DOCUMENT_BYTES)]),
      declaredName: "a.pdf",
      category: "TAX",
    });
    expect(grande.ok).toBe(false);
    if (!grande.ok) expect(grande.error).toBe("DOCUMENT_TOO_LARGE");
  });

  it("rechaza una categoría inventada", () => {
    const resultado = validateUpload({ bytes: pdf(), declaredName: "a.pdf", category: "NOMINAS" });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe("CATEGORY_UNKNOWN");
  });

  it("los mensajes de error se entienden sin saber inglés técnico", () => {
    const resultado = validateUpload({ bytes: Buffer.from("hola mundo"), declaredName: "a.txt", category: "OTHER" });
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) {
      expect(resultado.message).toMatch(/PDF/);
      expect(resultado.message).not.toMatch(/[A-Z_]{6,}/);
    }
  });
});

describe("nombre del archivo", () => {
  it("quita rutas y se queda con el nombre", () => {
    expect(sanitizeFileName("../../etc/passwd", "pdf")).toBe("passwd.pdf");
    expect(sanitizeFileName("C:\\Users\\rhc\\dni.pdf", "pdf")).toBe("dni.pdf");
  });

  it("quita comillas y punto y coma, que sirven para inyectar cabeceras", () => {
    const limpio = sanitizeFileName('dni";x=1;.pdf', "pdf");
    expect(limpio).not.toContain('"');
    expect(limpio).not.toContain(";");
  });

  it("quita caracteres de control", () => {
    const limpio = sanitizeFileName("dni\r\nContent-Type: text/html.pdf", "pdf");
    expect(limpio).not.toMatch(/[\r\n]/);
  });

  it("no deja un nombre oculto ni vacío", () => {
    expect(sanitizeFileName("...", "pdf")).toBe("");
    expect(sanitizeFileName("   ", "pdf")).toBe("");
    expect(sanitizeFileName(".oculto", "pdf")).toBe("oculto.pdf");
  });

  it("añade la extensión real cuando falta o no coincide", () => {
    expect(sanitizeFileName("escritura", "pdf")).toBe("escritura.pdf");
    expect(sanitizeFileName("escritura.exe", "pdf")).toBe("escritura.exe.pdf");
  });

  it("acorta el nombre largo conservando la extensión", () => {
    const largo = sanitizeFileName(`${"a".repeat(300)}.pdf`, "pdf");
    expect(largo.length).toBeLessThanOrEqual(120);
    expect(largo.endsWith(".pdf")).toBe(true);
  });
});

describe("qué documentos pide el expediente", () => {
  it("un autónomo no tiene que aportar estatutos ni escritura", () => {
    const categorias = requirementsFor({ legalForm: "AUTONOMO" }).map((r) => r.category);
    expect(categorias).not.toContain("BYLAWS");
    expect(categorias).not.toContain("NOTARY");
    expect(categorias).not.toContain("COMPANY_NAME");
    expect(categorias).toContain("IDENTITY");
    expect(categorias).toContain("TAX");
    expect(categorias).toContain("SOCIAL_SECURITY");
  });

  it("una sociedad sí, y en el orden en que se necesitan", () => {
    const categorias = requirementsFor({ legalForm: "SL" }).map((r) => r.category);
    expect(categorias.indexOf("COMPANY_NAME")).toBeLessThan(categorias.indexOf("NOTARY"));
    expect(categorias.indexOf("NOTARY")).toBeLessThan(categorias.indexOf("REGISTRY"));
    expect(categorias).toContain("BANK");
  });

  it("la licencia municipal sólo se pide si hay local", () => {
    expect(requirementsFor({ legalForm: "SL" }).map((r) => r.category)).not.toContain("LICENSE");
    expect(requirementsFor({ legalForm: "SL", hasPremises: true }).map((r) => r.category)).toContain("LICENSE");
  });

  it("cada documento explica para qué se pide", () => {
    for (const requisito of requirementsFor({ legalForm: "SL", hasPremises: true })) {
      expect(requisito.why.length, requisito.category).toBeGreaterThan(30);
      expect(requisito.title.length).toBeGreaterThan(5);
    }
  });

  it("ningún texto menciona el modelo 037 ni inventa un epígrafe", () => {
    const texto = requirementsFor({ legalForm: "SL", hasPremises: true })
      .map((r) => `${r.title} ${r.why}`)
      .join(" ");
    expect(texto).not.toMatch(/\b037\b/);
    expect(texto).not.toMatch(/\b\d{3}\.\d\b/);
  });

  it("toda categoría del esquema tiene etiqueta en castellano", () => {
    for (const categoria of DOCUMENT_CATEGORIES) {
      expect(CATEGORY_LABEL[categoria], categoria).toBeTruthy();
    }
  });
});
