begin;

-- =============================================================================
-- 013 · Archivar un expediente
--
-- Hasta ahora un expediente abierto no se podía quitar de en medio. Importa por
-- un motivo concreto: el panel muestra el más reciente, así que un expediente
-- de más —abierto por error, o un ensayo que no se siguió— desplaza al
-- verdadero y quien entra ve el trabajo perdido. Pasó de verdad en la cuenta de
-- A.R.E.S. y se arregló el fallo que lo causaba, pero el expediente sobrante
-- siguió ahí sin forma de retirarlo.
--
-- Archivar, no borrar. Un expediente guarda trámites, documentos y trazas de
-- quién hizo qué; borrarlo de verdad destruiría la prueba de una gestión, y eso
-- no se hace por una equivocación de bulto. Archivado deja de contar como
-- abierto, no lo elige el panel, y se puede devolver.
--
-- Aditiva.
-- =============================================================================

alter table business_projects
  add column if not exists archived_at timestamptz;

comment on column business_projects.archived_at is
  'Momento en que el expediente se archivó. Archivado no es borrado: deja de aparecer como abierto, pero conserva trámites, documentos y trazas.';

-- El panel elige "el más reciente" muchas veces; conviene que descartar los
-- archivados no cueste un recorrido completo de la tabla.
create index if not exists business_projects_abiertos_idx
  on business_projects (workspace_id, updated_at desc)
  where archived_at is null;

commit;
