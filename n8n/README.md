# Contrato n8n / Evolution

Este directorio no contiene una copia de `AgenteWhatsapp.json` porque el original puede controlar un WhatsApp físico y contiene `pinData` sensible.

## Único evento permitido

```text
messages.upsert
```

Todo evento distinto debe finalizar antes de Redis, transcripción, agente, PostgreSQL o respuesta.

## Cuerpo interno hacia BUROINSTANT

```json
{
  "provider": "EVOLUTION_API",
  "event": "messages.upsert",
  "instance": "<from trusted workflow config>",
  "messageId": "<provider message id>",
  "phone": "<normalized international number>",
  "pushName": "<optional>",
  "type": "text | voice",
  "text": "<message or transcript>",
  "timestamp": "<ISO-8601>"
}
```

Headers:

```text
Content-Type: application/json
X-Orbe-Timestamp: <same ISO-8601 time used for signing>
X-Orbe-Signature: HMAC_SHA256(secret, timestamp + "." + exactRawBody)
```

Destino:

```text
POST ${APP_URL}/api/internal/ingestion/whatsapp
```

## Redis

Clave obligatoria:

```text
orbe:wa:{instance}:{phone}:buffer
```

TTL recomendado: 30–120 segundos. Borrar la lista solo tras proceso correcto. Los duplicados se filtran también en PostgreSQL por `UNIQUE(instance, external_event_id)`.

## Audio

Conservar el patrón existente:

```text
messageId
→ /chat/getBase64FromMediaMessage/{instance}
→ Base64 a archivo temporal
→ transcripción
→ texto normalizado
→ mismo BusinessDataIngestionService
```

La API key debe provenir del credential store, nunca del cuerpo del Webhook. El archivo temporal se elimina al terminar salvo consentimiento y política explícitos.
