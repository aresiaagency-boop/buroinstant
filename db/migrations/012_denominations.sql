begin;

-- =============================================================================
-- 012 · Las denominaciones que se piden al Registro Mercantil Central
--
-- La carpeta del trámite `COMPANY_NAME` decía «falta subir la certificación
-- negativa», pero no decía QUÉ nombres pedir. Los cinco vivían fuera del
-- expediente, en un documento aparte, que es justo lo que BUROINSTANT existe
-- para evitar: se imprime la carpeta, se llega al RMC y hay que volver a
-- buscarlos.
--
-- El RMC admite hasta cinco por solicitud, por orden de preferencia, y concede
-- la primera que esté libre. Por eso hay orden y hay estado: interesa saber
-- cuál se concedió, no sólo cuáles se pidieron.
--
-- `denomination_certified_at` es la fecha de expedición de la certificación. De
-- ella arrancan dos relojes distintos que se confunden entre sí: tres meses
-- para otorgar la escritura y seis de reserva de la denominación. Una
-- resolución de la Dirección General de Seguridad Jurídica y Fe Pública de 29
-- de abril de 2026 rechazó una inscripción porque la certificación, expedida el
-- 22 de mayo de 2025, se presentó el 9 de diciembre: ya había caducado. Sin esa
-- fecha en el expediente, ese plazo no se puede avisar.
--
-- Aditiva.
-- =============================================================================

create table denomination_candidates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  -- 1 es la preferida. El RMC concede la primera libre, así que el orden manda.
  position int not null check (position between 1 and 5),
  name text not null check (length(btrim(name)) between 2 and 200),
  -- PROPOSED: pedida o por pedir. GRANTED: concedida. REJECTED: ocupada.
  status text not null default 'PROPOSED'
    check (status in ('PROPOSED', 'GRANTED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (project_id, position)
);

create index denomination_candidates_project_idx
  on denomination_candidates (project_id, position);

comment on table denomination_candidates is
  'Denominaciones solicitadas al Registro Mercantil Central, por orden de preferencia. Máximo cinco por solicitud.';

alter table business_projects
  add column if not exists denomination_certified_at date;

comment on column business_projects.denomination_certified_at is
  'Fecha de expedición de la certificación negativa del RMC. De ella corren los tres meses para otorgar escritura y los seis de reserva.';

commit;
