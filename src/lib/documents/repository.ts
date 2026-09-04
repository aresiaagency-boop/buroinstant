import { db } from "@/lib/db";
import type { Actor } from "@/types/domain";
import { openDocument, sealDocument } from "@/lib/documents/encryption";
import { CATEGORY_LABEL, type DocumentCategory } from "@/lib/documents/validation";
import { ProjectAccessError, assertProjectAccess } from "@/lib/task-repository";

/**
 * Archivo de documentos.
 *
 * Toda lectura y escritura pasa antes por `assertProjectAccess`: la pertenencia
 * al espacio de trabajo se comprueba en el servidor, y un expediente ajeno
 * responde lo mismo que uno inexistente. Que el panel no muestre un botón no es
 * control de acceso.
 *
 * Nada de lo que se registra aquí lleva contenido del documento ni material de
 * clave: los eventos guardan categoría, tamaño y huella, nunca los bytes.
 */

export type StoredDocument = {
  id: string;
  category: DocumentCategory;
  categoryLabel: string;
  displayName: string;
  mimeType: string;
  sizeBytes: number;
  contentHash: string;
  reviewStatus: string;
  requirementCode: string | null;
  versionCount: number;
  createdAt: string;
  updatedAt: string;
};

type DocumentRow = {
  id: string;
  category: string;
  display_name: string;
  mime_type: string;
  size_bytes: string | number;
  content_hash: string | null;
  review_status: string;
  requirement_code: string | null;
  created_at: Date;
  updated_at: Date;
  version_count: string | number;
};

function toStored(row: DocumentRow): StoredDocument {
  const category = row.category as DocumentCategory;
  return {
    id: row.id,
    category,
    categoryLabel: CATEGORY_LABEL[category] ?? category,
    displayName: row.display_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    contentHash: row.content_hash ?? "",
    reviewStatus: row.review_status,
    requirementCode: row.requirement_code,
    versionCount: Number(row.version_count),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listDocuments(actor: Actor, projectId: string): Promise<StoredDocument[]> {
  await assertProjectAccess(actor, projectId);
  const sql = db();
  const rows = await sql<DocumentRow[]>`
    select d.id, d.category, d.display_name, d.mime_type, d.size_bytes, d.content_hash,
           d.review_status, d.requirement_code, d.created_at, d.updated_at,
           (select count(*) from document_versions v where v.document_id = d.id) as version_count
    from documents d
    where d.project_id = ${projectId}
    order by d.created_at desc
  `;
  return rows.map(toStored);
}

export type StoreInput = {
  actor: Actor;
  projectId: string;
  category: DocumentCategory;
  displayName: string;
  mimeType: string;
  requirementCode?: string | null;
  bytes: Buffer;
};

/**
 * Guarda un documento cifrado. Si ya existe otro con la misma huella en la
 * misma categoría, no se duplica: se devuelve el que ya estaba. Subir dos veces
 * el mismo DNI escaneado no debe llenar el expediente de copias.
 */
export async function storeDocument(input: StoreInput): Promise<{ document: StoredDocument; duplicated: boolean }> {
  const { userId, workspaceId } = await assertProjectAccess(input.actor, input.projectId);
  const sealed = sealDocument(input.bytes);
  const sql = db();

  const [existente] = await sql<DocumentRow[]>`
    select d.id, d.category, d.display_name, d.mime_type, d.size_bytes, d.content_hash,
           d.review_status, d.requirement_code, d.created_at, d.updated_at,
           (select count(*) from document_versions v where v.document_id = d.id) as version_count
    from documents d
    where d.project_id = ${input.projectId}
      and d.category = ${input.category}
      and d.content_hash = ${sealed.contentHash}
    limit 1
  `;
  if (existente) return { document: toStored(existente), duplicated: true };

  // `object_key` viene del esquema original. Aquí el contenido no vive en un
  // almacén externo, así que la referencia apunta a la propia fila cifrada.
  const objectKey = `db://document_blobs/${sealed.contentHash.slice(0, 32)}`;

  const documento = await sql.begin(async (tx) => {
    const [fila] = await tx<Array<{ id: string }>>`
      insert into documents (
        workspace_id, project_id, category, display_name, object_key, mime_type,
        size_bytes, review_status, requirement_code, content_hash, created_by
      ) values (
        ${workspaceId}, ${input.projectId}, ${input.category}, ${input.displayName}, ${objectKey},
        ${input.mimeType}, ${sealed.sizeBytes}, 'UPLOADED', ${input.requirementCode ?? null},
        ${sealed.contentHash}, ${userId}
      )
      returning id
    `;

    await tx`
      insert into document_versions (workspace_id, document_id, version_number, object_key, content_hash, created_by)
      values (${workspaceId}, ${fila.id}, 1, ${objectKey}, ${sealed.contentHash}, ${userId})
    `;

    await tx`
      insert into document_blobs (
        workspace_id, document_id, version_number, ciphertext, iv, wrapped_key, key_iv,
        content_hash, size_bytes, created_by
      ) values (
        ${workspaceId}, ${fila.id}, 1, ${sealed.ciphertext}, ${sealed.iv}, ${sealed.wrappedKey},
        ${sealed.keyIv}, ${sealed.contentHash}, ${sealed.sizeBytes}, ${userId}
      )
    `;

    // Traza: qué entró, de qué tamaño y con qué huella. Nunca el contenido.
    await tx`
      insert into case_events (workspace_id, project_id, event_type, payload, created_by)
      values (${workspaceId}, ${input.projectId}, 'DOCUMENT_STORED', ${sql.json({
        category: input.category,
        mimeType: input.mimeType,
        sizeBytes: sealed.sizeBytes,
        contentHash: sealed.contentHash,
        requirementCode: input.requirementCode ?? null,
      })}, ${userId})
    `;

    return fila.id;
  });

  const [creado] = await sql<DocumentRow[]>`
    select d.id, d.category, d.display_name, d.mime_type, d.size_bytes, d.content_hash,
           d.review_status, d.requirement_code, d.created_at, d.updated_at,
           (select count(*) from document_versions v where v.document_id = d.id) as version_count
    from documents d where d.id = ${documento}
  `;
  return { document: toStored(creado), duplicated: false };
}

export type OpenedDocument = { displayName: string; mimeType: string; bytes: Buffer };

/**
 * Descifra un documento para entregarlo. El identificador del expediente viaja
 * en la consulta y se comprueba: pedir un documento con un `projectId` que no
 * es el suyo no lo encuentra.
 */
export async function readDocument(
  actor: Actor,
  projectId: string,
  documentId: string,
): Promise<OpenedDocument> {
  const { workspaceId, userId } = await assertProjectAccess(actor, projectId);
  const sql = db();

  const [fila] = await sql<
    Array<{
      display_name: string;
      mime_type: string;
      ciphertext: Buffer;
      iv: Buffer;
      wrapped_key: Buffer;
      key_iv: Buffer;
      content_hash: string;
    }>
  >`
    select d.display_name, d.mime_type, b.ciphertext, b.iv, b.wrapped_key, b.key_iv, b.content_hash
    from documents d
    join document_blobs b on b.document_id = d.id
    where d.id = ${documentId}
      and d.project_id = ${projectId}
      and d.workspace_id = ${workspaceId}
    order by b.version_number desc
    limit 1
  `;
  if (!fila) throw new ProjectAccessError();

  const bytes = openDocument({
    ciphertext: fila.ciphertext,
    iv: fila.iv,
    wrappedKey: fila.wrapped_key,
    keyIv: fila.key_iv,
    contentHash: fila.content_hash,
  });

  await sql`
    insert into case_events (workspace_id, project_id, event_type, payload, created_by)
    values (${workspaceId}, ${projectId}, 'DOCUMENT_OPENED', ${sql.json({
      documentId,
      contentHash: fila.content_hash,
    })}, ${userId})
  `;

  return { displayName: fila.display_name, mimeType: fila.mime_type, bytes };
}
