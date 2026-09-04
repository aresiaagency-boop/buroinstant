begin;

-- =============================================================================
-- 008 · Avisos de vencimiento
--
-- La tarea programada se ejecuta cada día y puede reintentarse. Sin memoria de
-- lo ya enviado, un reintento se traduce en dos mensajes al teléfono de una
-- persona, y un remitente que repite se silencia. Entonces el aviso deja de
-- servir para lo único que sirve.
--
-- Esta tabla es esa memoria: la clave única sobre (project_id, reminder_key)
-- hace que el segundo intento choque contra la base de datos en vez de contra
-- el buen criterio de quien escribió el código.
--
-- Aditiva.
-- =============================================================================

create table deadline_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  -- Obligación + ventana: "IVA_303:3T_2026#3".
  reminder_key text not null,
  obligation_code text not null,
  due_date date not null,
  days_before integer not null check (days_before >= 0),
  channel text not null default 'WHATSAPP' check (channel in ('WHATSAPP','EMAIL')),
  status text not null default 'SENT' check (status in ('SENT','FAILED','SKIPPED')),
  -- Motivo del fallo, sin PII: nunca el teléfono ni el cuerpo del mensaje.
  failure_reason text,
  sent_at timestamptz not null default now(),
  unique (project_id, reminder_key)
);

create index deadline_reminders_project_idx on deadline_reminders (project_id, sent_at desc);
create index deadline_reminders_due_idx on deadline_reminders (due_date);

commit;
