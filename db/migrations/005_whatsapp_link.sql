-- Vinculación del número de WhatsApp con la cuenta.
--
-- La prueba de que un número pertenece a alguien es que esa persona pueda
-- escribir desde él. Se emite un código en el panel y se envía por WhatsApp:
-- la posesión del teléfono es la verificación, sin depender de un proveedor de
-- SMS ni de que nadie teclee su número en un formulario.
--
-- El código caduca, se consume una sola vez, y emitir uno nuevo invalida el
-- anterior.

create table whatsapp_link_codes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  code text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_phone text,
  created_at timestamptz not null default now()
);

create unique index whatsapp_link_codes_code_idx
  on whatsapp_link_codes (code)
  where consumed_at is null;

create index whatsapp_link_codes_user_idx
  on whatsapp_link_codes (user_id, created_at desc);
