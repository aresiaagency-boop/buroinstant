# Arquitectura

## Capas

```text
INTERFACES
  Web / Voz web / WhatsApp texto / WhatsApp voz
                    │
                    ▼
NORMALIZED INBOUND MESSAGE
  canal · tipo · identidad externa · texto · timestamp
                    │
                    ▼
IDENTIDAD Y TENANCY
  user → workspace → project → formation_case
                    │
                    ▼
BUSINESS DATA INGESTION SERVICE
  extraer → validar → comparar → clasificar riesgo
        ┌───────────┴───────────┐
        ▼                       ▼
  autoaplicación          confirmación humana
        └───────────┬───────────┘
                    ▼
POSTGRESQL — FUENTE DE VERDAD
                    │
      ┌─────────────┼─────────────┐
      ▼             ▼             ▼
  expediente      agentes      event/timeline
      │             │             │
      └─────────────┴──────► LivingGoldenOrb
```

## Frontend

Next.js App Router y React. La landing presenta el producto; `/acceso` gestiona OAuth real o la demostración exclusivamente local; `/app` contiene el onboarding conversacional, el expediente y el Orbe.

La red hexagonal usa Canvas 2D, limita el DPR a 2, pausa fuera de visibilidad y respeta `prefers-reduced-motion`. No bloquea eventos de la interfaz. `LivingGoldenOrb` comunica cada estado con texto y `aria-live`, de modo que la animación nunca sea el único canal.

## Backend

Route handlers de Next.js validan entradas con Zod. La autorización ocurre server-side. El cliente nunca recibe secretos ni puede elegir una instancia Evolution arbitraria.

## PostgreSQL

Fuente de verdad operacional. El modelo separa identidad, workspace, proyectos, expedientes, fundadores, actividad, localizaciones, perfil fiscal, Seguridad Social, documentos, tareas, fuentes, conversaciones, consentimientos, ingesta, webhooks y auditoría. JSONB se limita a snapshots, metadata y salidas dinámicas.

## Fuentes oficiales

`fetchOfficialSource` impone:

- allowlist de hosts;
- HTTPS;
- redirecciones manuales y nuevamente validadas;
- timeout de 8 segundos;
- máximo de 1,5 MB;
- hash SHA-256 y timestamp de consulta.

El contenido externo es dato no confiable, nunca instrucción del sistema.

## WhatsApp

Evolution es el adaptador de canal; n8n es el orquestador; Redis mantiene buffer/locks/rate limits; PostgreSQL conserva el expediente.

```text
messages.upsert
  → n8n Webhook
  → normalización
  → orbe:wa:{instance}:{phone}:buffer (TTL)
  → texto ───────────────────────────────┐
  → audio → media fetch → transcripción ├→ OrbeInboundMessage
                                         └→ ingesta/confirmación/auditoría
```

El backend exige `event = messages.upsert`, firma HMAC, timestamp reciente, instancia conocida, esquema válido y `messageId` idempotente.

## Proveedores de IA

`LLMProvider` desacopla chat, salida estructurada y clasificación. Sin proveedor configurado, el sistema determinista sigue operativo y la consulta fiscal no inventa una respuesta.

## Fronteras

- Vercel: frontend y route handlers.
- EasyPanel: PostgreSQL y servicios backend separados.
- n8n: automatización asíncrona, nunca base de datos principal.
- Evolution API: transporte WhatsApp, nunca identidad primaria.
- Google Cloud: OAuth; secretos solo en configuración server-side.
