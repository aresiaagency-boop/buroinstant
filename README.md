# BUROINSTANT

Sistema operativo inteligente para convertir la intención de crear una empresa en España en un expediente estructurado, verificable y trazable.

## Qué incluye esta entrega

- Landing, acceso y consola responsive en Next.js 16 / React 19.
- `LivingGoldenOrb` con todos los estados del contrato y equivalentes textuales accesibles.
- Red hexagonal de filamentos de oro: responde al puntero con ondas y solidifica celdas al hacer clic.
- Onboarding conversacional web con voz cuando el navegador ofrece reconocimiento de voz.
- Extracción estructurada determinista, riesgos `LOW/MEDIUM/HIGH`, confirmación y conflictos.
- Google OAuth server-side mediante NextAuth; se activa al configurar sus tres variables.
- Esquema PostgreSQL relacional, migraciones versionadas y políticas RLS preparadas.
- API de proyectos, diagnóstico, conversación, fuentes oficiales, salud e ingesta WhatsApp.
- Adaptador de fuentes oficiales con allowlist, límite de tamaño, timeout y control de redirecciones.
- Webhook n8n → BUROINSTANT firmado con HMAC, ventana antireplay, evento único `messages.upsert`, instancia conocida, rate limit e idempotencia.
- Abstracciones de proveedor LLM y WhatsApp/Evolution sin secretos en cliente.
- Pruebas unitarias de ingesta, HMAC, SSRF/allowlist, evaluación y normalización telefónica.

La app no declara configuradas integraciones que no lo están. `/api/health` expone únicamente estados `configured/not_configured`, nunca valores ni secretos.

## Desarrollo local

Requisitos: Node.js 22–24 y npm 12.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Sin credenciales externas, la landing funciona y en desarrollo aparece “Abrir demostración local”. La demostración persiste solo en `localStorage` y está desactivada en producción. No sustituye PostgreSQL.

Calidad completa:

```bash
npm run check
```

## Variables

`.env.example` documenta todas las variables. Las críticas son:

| Variable | Propósito | Obligatoria en producción | Superficie |
| --- | --- | --- | --- |
| `APP_URL` | URL canónica y callback | Sí | servidor |
| `AUTH_SECRET` | Firma de sesión | Sí | servidor |
| `GOOGLE_CLIENT_ID` | OAuth Google | Sí | servidor |
| `GOOGLE_CLIENT_SECRET` | OAuth Google | Sí | servidor |
| `DATABASE_URL` | PostgreSQL fuente de verdad | Sí | servidor |
| `N8N_WEBHOOK_SECRET` | Firma HMAC o Bearer de máquina n8n → app | Sí para WhatsApp | servidor |
| `EVOLUTION_API_INSTANCE` | Instancia permitida | Sí para WhatsApp | servidor |
| `EVOLUTION_API_BASE_URL` | Comprobar que Evolution responde (matriz de servicios) | No | servidor |

Nunca crear una variante `NEXT_PUBLIC_*` de estas variables.

## Base de datos

Aplicar por orden:

```text
db/migrations/001_core.sql
db/migrations/002_tenant_rls.sql
```

No se ha ejecutado ninguna modificación manual contra el PostgreSQL abierto en EasyPanel. Antes de producción, crear un backup, aplicar las migraciones en una ventana controlada y usar un rol de aplicación no propietario con `app.user_id` y `app.workspace_id` por transacción.

## Google OAuth

Callback:

```text
${APP_URL}/api/auth/callback/google
```

La interfaz no ofrece un botón OAuth falso: permanece deshabilitado hasta que `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` y `AUTH_SECRET` estén configurados.

## Evolution API + n8n

El archivo fuente `AgenteWhatsapp.json` fue auditado únicamente en lectura. No se copia al repositorio porque contiene `pinData` con un secreto potencialmente expuesto y puede estar conectado a un WhatsApp físico.

Contrato obligatorio:

```text
Evolution API
  └─ solo messages.upsert
      └─ n8n Webhook POST
          └─ texto/audio → Redis buffer → transcripción
              └─ POST /api/internal/ingestion/whatsapp (HMAC)
                  └─ identidad → extracción → confirmación → PostgreSQL
```

Consultar [n8n/README.md](n8n/README.md) antes de modificar el workflow.

## Fuentes oficiales y agente AEAT

El adaptador permite exclusivamente HTTPS hacia hosts oficiales sembrados. Si una fuente no está disponible, devuelve `OFFICIAL_SOURCE_UNAVAILABLE`; si no existe razonamiento verificado, el agente devuelve `NO_VERIFIED_ANSWER`. Nunca completa el hueco con una invención.

La información ofrecida es orientativa y no constituye una consulta tributaria vinculante.

## Documentación

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [SECURITY.md](SECURITY.md)
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md)
- [docs/decisions](docs/decisions)
