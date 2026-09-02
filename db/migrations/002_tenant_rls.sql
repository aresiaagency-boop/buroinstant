begin;

-- The application must set app.workspace_id inside each transaction before
-- accessing tenant data. Use a dedicated non-owner application role in production.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workspace_members','business_projects','formation_cases','founders',
    'beneficial_owners','business_names','business_activities','business_locations',
    'tax_profiles','social_security_profiles','legal_form_assessments','documents',
    'document_versions','document_requirements','tasks','case_events','official_queries',
    'agent_sessions','agent_messages','notifications','consents','audit_events',
    'integration_connections','data_ingestion_events'
  ] loop
    execute format('alter table %I enable row level security', table_name);
    execute format(
      'create policy %I_workspace_isolation on %I using (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid) with check (workspace_id = nullif(current_setting(''app.workspace_id'', true), '''')::uuid)',
      table_name,
      table_name
    );
  end loop;
end $$;

alter table workspaces enable row level security;
create policy workspaces_isolation on workspaces
  using (id = nullif(current_setting('app.workspace_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.workspace_id', true), '')::uuid);

alter table users enable row level security;
create policy users_self_access on users
  using (id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check (id = nullif(current_setting('app.user_id', true), '')::uuid);

commit;
