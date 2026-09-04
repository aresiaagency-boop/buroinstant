begin;

-- =============================================================================
-- 007 · El documento como prueba del trámite
--
-- El archivo ya guarda documentos y el itinerario ya guarda trámites, pero no
-- había forma de decir «este papel acredita este paso». Sin ese vínculo, el
-- expediente no puede demostrar por qué un trámite está dado por hecho.
--
-- Un documento puede acreditar varios trámites (el justificante del 036 toca el
-- alta censal y el NIF) y un trámite puede necesitar varios documentos, así que
-- el vínculo va en su propia tabla.
--
-- Aditiva.
-- =============================================================================

create table task_documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  -- Se referencia el código del trámite, no su fila: el itinerario se recalcula
  -- y las filas se rehacen, pero el código es estable dentro del expediente.
  task_code text not null,
  document_id uuid not null references documents(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (project_id, task_code, document_id)
);

create index task_documents_project_task_idx on task_documents (project_id, task_code);
create index task_documents_document_idx on task_documents (document_id);

commit;
