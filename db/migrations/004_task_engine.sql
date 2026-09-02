begin;

-- =============================================================================
-- 004 · Motor de trámites
-- Aditiva. Da a `tasks` una identidad estable por expediente para poder
-- recalcular el itinerario sin duplicar ni perder el estado ya alcanzado.
-- =============================================================================

alter table tasks add column if not exists code text;
alter table tasks add column if not exists detail text;
alter table tasks add column if not exists priority integer not null default 100;
alter table tasks add column if not exists pending_verification text;
alter table tasks add column if not exists evidence text;
alter table tasks add column if not exists dependency_codes text[] not null default '{}';

-- Las filas anteriores a esta migración reciben un código derivado de su id,
-- para que la restricción de unicidad pueda aplicarse sin borrar nada.
update tasks set code = 'LEGACY_' || replace(id::text, '-', '') where code is null;

alter table tasks alter column code set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_project_code_key') then
    alter table tasks add constraint tasks_project_code_key unique (project_id, code);
  end if;
end $$;

create index if not exists tasks_project_priority_idx on tasks (project_id, priority);

commit;
