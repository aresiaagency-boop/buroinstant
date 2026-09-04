begin;

-- =============================================================================
-- 006 · Archivo de documentos
--
-- `documents` ya existía, pero apuntaba con `object_key` a un almacén que no
-- estaba en ninguna parte. Esta migración le da ese almacén y lo hace cifrado.
--
-- El contenido vive cifrado en `document_blobs`, separado de los metadatos, con
-- clave de datos propia por archivo envuelta con la clave maestra del entorno.
-- Consecuencia buscada: quien consiga leer la base de datos no obtiene ningún
-- documento, porque la clave maestra nunca está en ella.
--
-- Aditiva: no toca ni borra nada de lo anterior.
-- =============================================================================

create table document_blobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  -- Contenido cifrado con AES-256-GCM, con la etiqueta de autenticación al final.
  ciphertext bytea not null,
  iv bytea not null check (octet_length(iv) = 12),
  -- Clave de datos cifrada con la clave maestra. Nunca en claro.
  wrapped_key bytea not null,
  key_iv bytea not null check (octet_length(key_iv) = 12),
  -- SHA-256 del contenido en claro: detecta duplicados y verifica el descifrado.
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (document_id, version_number)
);

create index document_blobs_workspace_idx on document_blobs (workspace_id, created_at desc);

-- El estado de verificación de un documento no es lo mismo que tenerlo subido:
-- una escritura puede estar en el archivo y todavía no estar inscrita.
alter table documents add column if not exists review_status text not null default 'UPLOADED';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_review_status_check') then
    alter table documents add constraint documents_review_status_check
      check (review_status in ('UPLOADED','VERIFIED','REJECTED','SUPERSEDED'));
  end if;
end $$;

-- De qué requisito del expediente responde este documento. Sin él, el archivo
-- es una carpeta de descargas; con él, el panel sabe qué falta todavía.
alter table documents add column if not exists requirement_code text;

alter table documents add column if not exists content_hash text;

create index if not exists documents_project_category_idx
  on documents (project_id, category, created_at desc);

commit;
