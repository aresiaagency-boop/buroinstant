begin;

-- =============================================================================
-- 003 · Control de administración
-- Aditiva. No borra datos ni cambia columnas existentes.
-- Da soporte al panel de superadministración: ciclo de vida de la cuenta,
-- rastro de actividad y calidad de las respuestas del agente.
-- =============================================================================

-- Ciclo de vida de la cuenta. Las cuentas existentes quedan ACTIVE para no
-- expulsar a nadie al desplegar.
alter table users add column if not exists account_status text not null default 'ACTIVE';
alter table users add column if not exists last_seen_at timestamptz;
alter table users add column if not exists suspended_at timestamptz;
alter table users add column if not exists suspended_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_account_status_check'
  ) then
    alter table users add constraint users_account_status_check
      check (account_status in ('PENDING', 'ACTIVE', 'SUSPENDED'));
  end if;
end $$;

create index if not exists users_account_status_idx on users (account_status, created_at desc);
create index if not exists users_last_seen_idx on users (last_seen_at desc nulls last);

-- Calidad de las respuestas del agente fiscal (§80 del mandato).
alter table official_queries add column if not exists quality_flag text;
alter table official_queries add column if not exists reviewed_at timestamptz;
alter table official_queries add column if not exists reviewed_by uuid references users(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'official_queries_quality_flag_check'
  ) then
    alter table official_queries add constraint official_queries_quality_flag_check
      check (quality_flag is null or quality_flag in ('CORRECT', 'PARTIAL', 'INCORRECT', 'OUTDATED_SOURCE'));
  end if;
end $$;

-- Revisión profesional del expediente (§53).
alter table formation_cases add column if not exists review_state text not null default 'AI_REVIEWED';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'formation_cases_review_state_check'
  ) then
    alter table formation_cases add constraint formation_cases_review_state_check
      check (review_state in ('AI_REVIEWED', 'HUMAN_REVIEW_REQUESTED', 'HUMAN_REVIEWED'));
  end if;
end $$;

-- Acciones del superadministrador. audit_events exige workspace_id, y una acción
-- de plataforma no pertenece a ningún espacio de trabajo: necesita su propio libro.
create table if not exists admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_idx on admin_audit_events (created_at desc);

commit;
