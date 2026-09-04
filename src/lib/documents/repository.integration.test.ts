import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Actor } from "@/types/domain";
import { db, isDatabaseConfigured } from "@/lib/db";
import { isEncryptionConfigured } from "@/lib/documents/encryption";
import { listDocuments, readDocument, storeDocument } from "@/lib/documents/repository";
import { ProjectAccessError } from "@/lib/task-repository";

/**
 * Integración contra PostgreSQL real. Comprueba lo que ninguna prueba en
 * memoria puede comprobar: que el contenido llega cifrado a la tabla, que
 * vuelve idéntico, y que un expediente ajeno no se abre ni sabiendo su
 * identificador.
 *
 * Se omite si falta la base de datos o la clave de cifrado, para que la suite
 * siga pasando en un entorno sin ellas.
 */
const enabled = isDatabaseConfigured() && isEncryptionConfigured();
const suite = enabled ? describe : describe.skip;

const PROPIO: Actor = {
  userId: "test-doc-owner",
  email: "doc-owner@example.test",
  name: "Titular del archivo",
  mode: "oauth",
};
const AJENO: Actor = {
  userId: "test-doc-other",
  email: "doc-other@example.test",
  name: "Otro inquilino",
  mode: "oauth",
};

const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), randomBytes(4096)]);
const OTRO_PDF = Buffer.concat([Buffer.from("%PDF-1.7\n", "latin1"), randomBytes(2048)]);

let proyectoPropio = "";
let proyectoAjeno = "";
let documentoPropio = "";

async function crearProyecto(actor: Actor, nombre: string): Promise<string> {
  const { ensureActorWorkspace } = await import("@/lib/repository");
  const { userId, workspaceId } = await ensureActorWorkspace(actor);
  const sql = db();
  const [fila] = await sql<Array<{ id: string }>>`
    insert into business_projects (workspace_id, name, business_description, created_by)
    values (${workspaceId}, ${nombre}, ${"Proyecto de prueba del archivo"}, ${userId})
    returning id
  `;
  return fila.id;
}

suite("archivo de documentos contra la base de datos", () => {
  beforeAll(async () => {
    proyectoPropio = await crearProyecto(PROPIO, "Archivo · expediente propio");
    proyectoAjeno = await crearProyecto(AJENO, "Archivo · expediente ajeno");
  });

  afterAll(async () => {
    // Sólo se borran los proyectos: los usuarios de prueba tienen
    // `oauth_subject` fijo y se reutilizan, y otras tablas los referencian.
    const sql = db();
    await sql`delete from business_projects where id in (${proyectoPropio}, ${proyectoAjeno})`;
  });

  it("guarda el documento y lo devuelve idéntico", async () => {
    const { document, duplicated } = await storeDocument({
      actor: PROPIO,
      projectId: proyectoPropio,
      category: "NOTARY",
      displayName: "escritura.pdf",
      mimeType: "application/pdf",
      bytes: PDF,
    });
    documentoPropio = document.id;

    expect(duplicated).toBe(false);
    expect(document.sizeBytes).toBe(PDF.length);
    expect(document.categoryLabel).toBe("Notaría");

    const abierto = await readDocument(PROPIO, proyectoPropio, document.id);
    expect(abierto.bytes.equals(PDF)).toBe(true);
    expect(abierto.mimeType).toBe("application/pdf");
  });

  it("lo que hay en la tabla está cifrado: no contiene el original", async () => {
    const sql = db();
    const [fila] = await sql<Array<{ ciphertext: Buffer; wrapped_key: Buffer }>>`
      select ciphertext, wrapped_key from document_blobs where document_id = ${documentoPropio}
    `;
    expect(fila.ciphertext.includes(PDF)).toBe(false);
    // Ni siquiera la cabecera del PDF sobrevive en claro.
    expect(fila.ciphertext.subarray(0, 8).toString("latin1")).not.toContain("%PDF");
    // El cifrado añade la etiqueta de autenticación de 16 bytes.
    expect(fila.ciphertext.length).toBe(PDF.length + 16);
    expect(fila.wrapped_key.length).toBe(48);
  });

  it("no duplica el mismo documento en la misma categoría", async () => {
    const repetido = await storeDocument({
      actor: PROPIO,
      projectId: proyectoPropio,
      category: "NOTARY",
      displayName: "escritura-copia.pdf",
      mimeType: "application/pdf",
      bytes: PDF,
    });
    expect(repetido.duplicated).toBe(true);
    expect(repetido.document.id).toBe(documentoPropio);

    const lista = await listDocuments(PROPIO, proyectoPropio);
    expect(lista.filter((d) => d.category === "NOTARY")).toHaveLength(1);
  });

  it("el mismo contenido en otra categoría sí es otro documento", async () => {
    const otro = await storeDocument({
      actor: PROPIO,
      projectId: proyectoPropio,
      category: "IDENTITY",
      displayName: "dni.pdf",
      mimeType: "application/pdf",
      bytes: PDF,
    });
    expect(otro.duplicated).toBe(false);
    expect(otro.document.id).not.toBe(documentoPropio);
  });

  it("deja traza del guardado sin el contenido", async () => {
    const sql = db();
    const eventos = await sql<Array<{ event_type: string; payload: Record<string, unknown> }>>`
      select event_type, payload from case_events
      where project_id = ${proyectoPropio} and event_type = 'DOCUMENT_STORED'
    `;
    expect(eventos.length).toBeGreaterThan(0);
    for (const evento of eventos) {
      const texto = JSON.stringify(evento.payload);
      expect(texto).not.toContain("%PDF");
      expect(texto).not.toContain(PDF.toString("base64").slice(0, 32));
      expect(evento.payload.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  describe("aislamiento entre inquilinos", () => {
    it("no se puede listar el archivo de otro expediente", async () => {
      await expect(listDocuments(AJENO, proyectoPropio)).rejects.toThrow(ProjectAccessError);
    });

    it("no se puede escribir en el archivo de otro expediente", async () => {
      await expect(
        storeDocument({
          actor: AJENO,
          projectId: proyectoPropio,
          category: "BANK",
          displayName: "intruso.pdf",
          mimeType: "application/pdf",
          bytes: OTRO_PDF,
        }),
      ).rejects.toThrow(ProjectAccessError);
    });

    it("no se puede descargar un documento ajeno ni sabiendo su identificador", async () => {
      await expect(readDocument(AJENO, proyectoPropio, documentoPropio)).rejects.toThrow(ProjectAccessError);
    });

    it("tampoco pasando el propio expediente y el documento ajeno", async () => {
      await expect(readDocument(AJENO, proyectoAjeno, documentoPropio)).rejects.toThrow(ProjectAccessError);
    });

    it("el expediente del otro sigue intacto", async () => {
      const lista = await listDocuments(AJENO, proyectoAjeno);
      expect(lista).toHaveLength(0);
    });

    it("el error de acceso ajeno es el mismo que el de un expediente inexistente", async () => {
      let porAjeno = "";
      let porInexistente = "";
      try {
        await listDocuments(AJENO, proyectoPropio);
      } catch (error) {
        porAjeno = (error as Error).message;
      }
      try {
        await listDocuments(AJENO, "00000000-0000-4000-8000-000000000000");
      } catch (error) {
        porInexistente = (error as Error).message;
      }
      expect(porAjeno).toBe(porInexistente);
      expect(porAjeno).toBe("PROJECT_NOT_FOUND");
    });
  });
});
