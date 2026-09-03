# Auditoría del workflow `INGESTA_BUROINSTANT`

Leído en vivo el 2026-09-02 desde la instancia n8n de EasyPanel.
Workflow `1ns7a4kGuoI4Wf57`, activo, 25 nodos, 0 ejecuciones de producción.

## Ruta real de los datos

```
Webhook (POST)
  → Edit Fields6            normaliza el evento de Evolution API
  → push_buffer1 (Redis)    empuja el mensaje al buffer del número
  → get_message_buffer1     lee el buffer
  → Switch2
       ├─ salida 0 → No Operation                (descarta)
       ├─ salida 1 → Redis3 → Split Out1 → JSON Parser1 → Switch3
       │                                            ├─ salida 0 (audio) → Get Audio
       │                                            │     → Convert to File1
       │                                            │     → Transcribe a recording1
       │                                            │     → Edit Fields5 ─┐
       │                                            └─ salida 1 (texto) → Edit Fields7 ─┤
       │                                                                         Merge1 ←┘
       │                          Merge1 → Sort1 → Aggregate2 → Code2
       │                                    Code2 → AI Agent
       │                                    Code2 → BUROINSTANT_PERSISTIR
       └─ salida 2 → Wait1 → get_message_buffer1   (debounce: espera a que
                                                    la persona termine de escribir)

AI Agent → whatsapp_response          (responde por Evolution API)
AI Agent → BUROINSTANT_PERSISTIR      (POST a la app)

OpenAI Chat Model    → AI Agent (ai_languageModel)
Postgres Chat Memory → AI Agent (ai_memory)
```

El diseño es correcto: buffer en Redis con debounce, una sola rama de
transcripción para las notas de voz, memoria conversacional en PostgreSQL y
persistencia en la aplicación separada de la respuesta al usuario.

## Hallazgo 1 — la persistencia estaba devolviendo 401 (CORREGIDO)

`BUROINSTANT_PERSISTIR` hace `POST https://buroinstant.vercel.app/api/internal/ingestion/whatsapp`
con un cuerpo JSON que encaja exactamente con `whatsappWebhookSchema`, pero
**no enviaba ninguna cabecera**.

Esa ruta exige una de estas dos pruebas de origen máquina:

- firma HMAC-SHA256 en `x-orbe-signature` sobre `timestamp + "." + rawBody`,
  con `x-orbe-timestamp` dentro de una ventana de 5 minutos; o
- `Authorization: Bearer <N8N_WEBHOOK_SECRET>`.

Sin ninguna de las dos responde `401 INVALID_SIGNATURE`. Es decir: **nada de lo
que llegaba por WhatsApp entraba en el expediente**, aunque el agente
respondiera con normalidad al usuario. El fallo era invisible desde WhatsApp.

Corrección aplicada: el nodo usa ahora `httpBearerAuth` con la credencial
«Bearer Auth account» ya existente en n8n.

**Pendiente de verificar por una persona:** que el token de esa credencial sea
exactamente el valor de `N8N_WEBHOOK_SECRET` en Vercel. Si no coincide, la
ruta seguirá devolviendo 401 — con otro motivo, pero el mismo efecto.

Comprobar también que en Vercel existen `N8N_WEBHOOK_SECRET`,
`EVOLUTION_API_INSTANCE` y `DATABASE_URL`: si falta cualquiera de las tres, la
ruta responde `503 INGESTION_NOT_CONFIGURED` antes de mirar la firma.

## Hallazgo 2 — la clave de Evolution viaja dentro del webhook

`Edit Fields6` toma `instance.apikey` de `$('Webhook').item.json.body.apikey`, y
`whatsapp_response` la reenvía como cabecera `apikey`.

Dos consecuencias:

1. La clave real de Evolution API queda registrada en los datos de ejecución de
   n8n cada vez que entra un mensaje.
2. El cuerpo del webhook es entrada no confiable. Quien alcance la URL del
   webhook decide a qué servidor y con qué clave llama n8n al responder.

Corrección recomendada, en este orden:

1. Rotar la clave de Evolution API.
2. Guardarla en una credencial de n8n (Header Auth con nombre `apikey`).
3. Que `whatsapp_response` use esa credencial y que `server_url` sea una
   constante del workflow, no un campo del cuerpo.
4. Dejar de propagar `instance.apikey` en `Edit Fields6`.
5. Firmar el webhook de Evolution hacia n8n y comprobar la firma antes del
   buffer.

No se ha tocado: cambia el camino de una credencial en producción y requiere
rotar primero.

## Hallazgo 3 — el agente respondía «no puedo procesar ese mensaje» (CORREGIDO)

Prueba real por WhatsApp el 3 de septiembre: a un «Hola» el agente contestó «No
puedo procesar ese tipo de mensajes»; a «Quiero una empresa para mi solo»,
«No puedo comprender el mensaje que enviaste». Las tres ejecuciones figuran como
Success en n8n: el fallo no era técnico, era el prompt.

El System Message tenía 1.374 caracteres de marcador. Se ha sustituido por el
de `n8n/prompts/system-message.txt` (8.036 caracteres), que define el rol de
representante ejecutivo sénior de BUROINSTANT, despliega qué hace el producto y
sus servicios, prohíbe expresamente esa familia de frases y cierra cada mensaje
invitando a https://buroinstant.vercel.app.

Detalle que condiciona todo el prompt: `whatsapp_response` envía
`{{ $json.output }}`, la salida literal del agente. Por eso el prompt prohíbe
JSON y markdown: lo que escriba el agente es exactamente lo que lee la persona.

## Hallazgo 4 — el agente no sabe por qué canal le hablan

`AI Agent` recibe `Mensaje del usuario: {{ $('Code2').item.json.message }}`.
No incluye el canal, así que el prompt no puede distinguir WhatsApp de web.

Corrección recomendada: añadir el canal al texto del nodo, por ejemplo

```
Canal: {{ $('Edit Fields6').first().json.message.content_type === 'audio' ? 'WHATSAPP_VOICE' : 'WHATSAPP_TEXT' }}
Mensaje del usuario: {{ $('Code2').item.json.message }}
```

Mientras no se añada, el agente asume WhatsApp, que es el único canal que hoy
entra por este workflow.
