begin;

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table users (
  id uuid primary key default gen_random_uuid(),
  oauth_subject text not null unique,
  email text not null,
  full_name text not null,
  preferred_language text not null default 'es' check (preferred_language in ('es', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index users_email_lower_idx on users (lower(email));

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_account_id)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','FOUNDER','ADVISOR','ACCOUNTANT','LAWYER','COLLABORATOR','VIEWER')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (workspace_id, user_id)
);

create table business_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  business_description text not null,
  preferred_language text not null default 'es' check (preferred_language in ('es','en')),
  preferred_legal_form text,
  case_stage text not null default 'IDEA' check (case_stage in ('IDEA','ASSESSMENT','STRUCTURE','PREPARATION','INCORPORATION','REGISTRY','TAX_REGISTRATION','SOCIAL_SECURITY','LICENSES','OPERATING')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);
create index business_projects_workspace_idx on business_projects (workspace_id, updated_at desc);

create table formation_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  stage text not null default 'IDEA',
  status text not null default 'OPEN' check (status in ('OPEN','BLOCKED','READY_FOR_REVIEW','CLOSED')),
  risk_flags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (project_id)
);

create table founders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  display_name text not null,
  founder_type text not null check (founder_type in ('NATURAL_PERSON','LEGAL_PERSON')),
  ownership_percentage numeric(5,2) check (ownership_percentage between 0 and 100),
  field_status text not null default 'PROPOSED' check (field_status in ('PROPOSED','CONFIRMED','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table beneficial_owners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  encrypted_payload bytea not null,
  field_status text not null default 'PROPOSED' check (field_status in ('PROPOSED','CONFIRMED','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table business_names (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  proposed_name text not null,
  status text not null default 'PROPOSED' check (status in ('PROPOSED','CHECK_PENDING','AVAILABLE','UNAVAILABLE','RESERVED')),
  verification_source_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table business_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  description text not null,
  is_primary boolean not null default false,
  iae_code text,
  cnae_code text,
  classification_status text not null default 'UNVERIFIED' check (classification_status in ('UNVERIFIED','PROPOSED','OFFICIALLY_VERIFIED','HUMAN_REVIEWED')),
  classification_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table business_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  location_type text not null check (location_type in ('REGISTERED_OFFICE','TAX_ADDRESS','ACTIVITY_ADDRESS')),
  encrypted_address bytea,
  municipality text,
  province text,
  autonomous_community text,
  country_code char(2) not null default 'ES',
  field_status text not null default 'PROPOSED' check (field_status in ('PROPOSED','CONFIRMED','REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table tax_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade unique,
  profile jsonb not null default '{}'::jsonb,
  source_last_verified_at timestamptz,
  review_status text not null default 'PENDING' check (review_status in ('PENDING','AI_REVIEWED','HUMAN_REVIEW_REQUESTED','HUMAN_REVIEWED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table social_security_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade unique,
  profile jsonb not null default '{}'::jsonb,
  source_last_verified_at timestamptz,
  review_status text not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table legal_form_assessments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  input_snapshot jsonb not null,
  result jsonb not null,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  authority text not null check (authority in ('OFFICIAL_SOURCE','LAW','INFERENCE','USER_DATA','MODEL_SUGGESTION')),
  professional_review_recommended boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  category text not null check (category in ('IDENTITY','COMPANY_NAME','BYLAWS','NOTARY','TAX','REGISTRY','SOCIAL_SECURITY','LICENSE','BANK','CONTRACT','OTHER')),
  display_name text not null,
  object_key text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  object_key text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (document_id, version_number)
);

create table document_requirements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  category text not null,
  status text not null default 'MISSING' check (status in ('MISSING','UPLOADED','VERIFIED','REJECTED','NOT_APPLICABLE')),
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  title text not null,
  authority text,
  status text not null default 'NOT_STARTED' check (status in ('NOT_STARTED','WAITING_USER','READY','IN_PROGRESS','WAITING_AUTHORITY','COMPLETED','BLOCKED','NOT_APPLICABLE')),
  due_date date,
  dependency_ids uuid[] not null default '{}',
  source_url text,
  required_documents jsonb not null default '[]'::jsonb,
  responsible_user uuid references users(id),
  verification_method text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);
create index tasks_project_status_idx on tasks (project_id, status, due_date);

create table case_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references business_projects(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);
create index case_events_project_time_idx on case_events (project_id, occurred_at desc);

create table official_sources (
  id uuid primary key default gen_random_uuid(),
  authority text not null,
  title text not null,
  url text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table official_source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references official_sources(id) on delete cascade,
  url text not null,
  title text not null,
  content_hash text not null,
  fetched_at timestamptz not null,
  effective_date date,
  raw_text text,
  normalized_text text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, content_hash)
);

create table official_queries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references business_projects(id) on delete cascade,
  question text not null,
  answer text,
  statement_authority text not null,
  confidence numeric(4,3) check (confidence between 0 and 1),
  informational_only boolean not null default true,
  source_snapshot_ids uuid[] not null default '{}',
  status text not null default 'PENDING' check (status in ('PENDING','ANSWERED','NO_VERIFIED_SOURCE','FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid references business_projects(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  channel text not null check (channel in ('WEB','WHATSAPP')),
  external_session_key_hash text,
  active_project_id uuid references business_projects(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table agent_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  agent_session_id uuid not null references agent_sessions(id) on delete cascade,
  role text not null check (role in ('USER','ASSISTANT','TOOL')),
  content text not null,
  source_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references business_projects(id) on delete cascade,
  channel text not null check (channel in ('IN_APP','EMAIL','WHATSAPP')),
  title text not null,
  body text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','READ','FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  consent_type text not null check (consent_type in ('PRIVACY','AI_PROCESSING','SERVICE_COMMUNICATIONS','MARKETING_COMMUNICATIONS','AUDIO_RETENTION')),
  granted boolean not null,
  policy_version text not null,
  source text not null,
  granted_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  source jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);
create index audit_events_workspace_time_idx on audit_events (workspace_id, created_at desc);

create table integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  provider text not null,
  status text not null default 'NOT_CONFIGURED' check (status in ('NOT_CONFIGURED','CONNECTED','DEGRADED','DISCONNECTED')),
  encrypted_configuration bytea,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id),
  unique (workspace_id, provider)
);

create table user_contact_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('WHATSAPP','EMAIL','PHONE')),
  normalized_value text not null,
  verified boolean not null default false,
  verified_at timestamptz,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (type, normalized_value)
);

create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  instance text not null,
  external_event_id text not null,
  payload_hash text not null,
  status text not null check (status in ('RECEIVED','NEEDS_IDENTITY','PROCESSED','FAILED')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (instance, external_event_id)
);

create table data_ingestion_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  project_id uuid references business_projects(id) on delete cascade,
  case_id uuid references formation_cases(id) on delete set null,
  channel text not null check (channel in ('WEB','WHATSAPP')),
  input_type text not null check (input_type in ('TEXT','VOICE','IMAGE','DOCUMENT')),
  external_message_id text,
  raw_text text not null,
  normalized_text text not null,
  extracted_data jsonb not null default '[]'::jsonb,
  status text not null check (status in ('RECEIVED','TRANSCRIBED','EXTRACTED','NEEDS_CONFIRMATION','CONFIRMED','APPLIED','REJECTED','FAILED')),
  confidence numeric(4,3) check (confidence between 0 and 1),
  requires_confirmation boolean not null default false,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references users(id)
);
create unique index data_ingestion_external_unique
  on data_ingestion_events (channel, external_message_id)
  where external_message_id is not null;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'users','accounts','workspaces','workspace_members','business_projects','formation_cases',
    'founders','beneficial_owners','business_names','business_activities','business_locations',
    'tax_profiles','social_security_profiles','legal_form_assessments','documents',
    'document_requirements','tasks','official_sources','official_queries','agent_sessions',
    'notifications','integration_connections','user_contact_methods','data_ingestion_events'
  ] loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', table_name, table_name);
  end loop;
end $$;

insert into official_sources (authority, title, url) values
  ('AEAT', 'Asistente Virtual Censal', 'https://www2.agenciatributaria.gob.es/wlpl/AVAC-CALC/AsistenteCensal'),
  ('AEAT', 'Impuesto sobre Actividades Económicas', 'https://sede.agenciatributaria.gob.es/Sede/declaraciones-informativas-otros-impuestos-tasas/impuesto-sobre-actividades-economicas.html'),
  ('AEAT', 'Portal Empresas', 'https://sede.agenciatributaria.gob.es/Sede/empresas.html'),
  ('BOE', 'Boletín Oficial del Estado', 'https://www.boe.es/'),
  ('AGE', 'CIRCE', 'https://administracion.gob.es/pag_Home/Tramites/miEmpresaEnTramites/Iniciativas/CIRCE.html'),
  ('TGSS', 'Seguridad Social', 'https://www.seg-social.es/'),
  ('REGISTRADORES', 'Colegio de Registradores', 'https://www.registradores.org/')
on conflict (url) do nothing;

commit;
