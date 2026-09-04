import { db } from "@/lib/db";
import { ensureActorWorkspace } from "@/lib/repository";
import { normalizeWhatsAppPhone } from "@/lib/whatsapp";
import { LINK_CODE_TTL_MINUTES, generateLinkCode, maskPhone } from "@/lib/whatsapp-link";
import type { Actor } from "@/types/domain";

export type LinkState =
  | { status: "LINKED"; maskedPhone: string; verifiedAt: string }
  | { status: "PENDING"; code: string; expiresAt: string }
  | { status: "NONE" };

/** Emite un código nuevo e invalida el anterior: solo uno vivo por persona. */
export async function issueLinkCode(actor: Actor): Promise<{ code: string; expiresAt: string }> {
  const { userId, workspaceId } = await ensureActorWorkspace(actor);
  const sql = db();
  await sql`
    update whatsapp_link_codes set consumed_at = now()
    where user_id = ${userId} and consumed_at is null
  `;
  const code = generateLinkCode();
  const [row] = await sql<Array<{ expires_at: Date }>>`
    insert into whatsapp_link_codes (workspace_id, user_id, code, expires_at)
    values (
      ${workspaceId}, ${userId}, ${code},
      now() + ${`${LINK_CODE_TTL_MINUTES} minutes`}::interval
    )
    returning expires_at
  `;
  return { code, expiresAt: row.expires_at.toISOString() };
}

export async function readLinkState(actor: Actor): Promise<LinkState> {
  const { userId } = await ensureActorWorkspace(actor);
  const sql = db();

  const [contact] = await sql<Array<{ normalized_value: string; verified_at: Date | null }>>`
    select normalized_value, verified_at
    from user_contact_methods
    where user_id = ${userId} and type = 'WHATSAPP' and verified = true
    order by verified_at desc nulls last
    limit 1
  `;
  if (contact) {
    return {
      status: "LINKED",
      maskedPhone: maskPhone(contact.normalized_value),
      verifiedAt: (contact.verified_at ?? new Date()).toISOString(),
    };
  }

  const [pending] = await sql<Array<{ code: string; expires_at: Date }>>`
    select code, expires_at from whatsapp_link_codes
    where user_id = ${userId} and consumed_at is null and expires_at > now()
    order by created_at desc limit 1
  `;
  if (pending) {
    return { status: "PENDING", code: pending.code, expiresAt: pending.expires_at.toISOString() };
  }
  return { status: "NONE" };
}

/**
 * Canjea un código llegado por WhatsApp y deja el número verificado.
 *
 * Devuelve null si el código no existe, ha caducado o ya se usó: un código
 * vale una vez. La verificación es la posesión del teléfono, así que se marca
 * `verified` en el mismo movimiento.
 */
export async function consumeLinkCode(
  code: string,
  rawPhone: string,
): Promise<{ userId: string; phone: string } | null> {
  const phone = normalizeWhatsAppPhone(rawPhone);
  const sql = db();

  return sql.begin(async (transaction) => {
    const [pending] = await transaction<Array<{ id: string; user_id: string }>>`
      select id, user_id from whatsapp_link_codes
      where code = ${code} and consumed_at is null and expires_at > now()
      limit 1
      for update
    `;
    if (!pending) return null;

    await transaction`
      update whatsapp_link_codes
      set consumed_at = now(), consumed_phone = ${phone}
      where id = ${pending.id}
    `;
    await transaction`
      insert into user_contact_methods (user_id, type, normalized_value, verified, verified_at, provider)
      values (${pending.user_id}, 'WHATSAPP', ${phone}, true, now(), 'EVOLUTION_API')
      on conflict (type, normalized_value)
      do update set user_id = ${pending.user_id}, verified = true, verified_at = now(), provider = 'EVOLUTION_API'
    `;
    return { userId: pending.user_id, phone };
  });
}
