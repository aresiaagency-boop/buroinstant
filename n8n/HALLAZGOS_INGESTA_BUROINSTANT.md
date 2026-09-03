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


## Hallazgo 5 — el workflow ejecutaba una versión publicada antigua (CORREGIDO)

Esta era la causa real de que el agente siguiera respondiendo «no puedo
procesar» después de instalar el prompt nuevo.

n8n separa el borrador de la versión publicada. `PATCH /rest/workflows/:id`
guarda el borrador y devuelve 200, pero las ejecuciones siguen usando
`activeVersionId`. Se comprobó leyendo `workflowData` de las ejecuciones 11 y
12: ambas corrieron con un `systemMessage` de 1.374 caracteres mientras el
borrador ya tenía 8.036.

Publicar por API: `POST /rest/workflows/:id/activate` con `{versionId}`. Ni
`PATCH` de `activeVersionId` ni desactivar y reactivar sirven.

Verificado: la ejecución 16 corre con `systemMessage` de 8.914 caracteres.

**Regla para el futuro: después de editar el workflow por API hay que publicar.**

## Hallazgo 6 — el agente ya consulta fuente oficial

Nodo nuevo `consultar_fuente_oficial`
(`@n8n/n8n-nodes-langchain.toolHttpRequest`), conectado al AI Agent por
`ai_tool`. Llama a `POST /api/internal/official-sources/lookup` con la misma
credencial Bearer.

La lista de dominios admitidos vive en el servidor, no en el prompt: el modelo
manda una pregunta, nunca una URL. Si aun así envía una, tiene que estar en
`OFFICIAL_SOURCE_HOSTS` o se rechaza con 400. Así un mensaje de un tercero no
puede convertir la ruta en un proxy.

Cuando ninguna sede responde, la ruta devuelve `verdict: NO_VERIFIED_SOURCE` y
el prompt obliga a decirlo en lugar de rellenar el hueco.

La herramienta no funcionará hasta que se despliegue la aplicación: hoy esa
ruta todavía no existe en producción.

## Hallazgo 7 — el desfase de 3 horas del antirrebote

`Switch2` decide si continuar comparando
`timestampt + 3 horas` con el momento actual. Es un ajuste de zona horaria
escrito a mano.

Dos consecuencias: dejará de cuadrar cuando cambie el horario de verano, y si la
marca de tiempo no encaja, la ejecución entra en el bucle `Wait1` y se queda
corriendo indefinidamente — ocurrió en una prueba y hubo que pararla a mano.

Recomendación: comparar en UTC y usar la zona horaria del workflow en lugar de
sumar horas fijas.

## Hallazgo 8 — Code2 descarta cargas sintéticas

`Code2` tiene tres guardas que devuelven `[]`. Los mensajes reales de WhatsApp
las pasan (ejecuciones 4 a 11), pero las cargas de prueba enviadas al webhook se
detienen ahí, así que no se pudo leer una respuesta del agente sin un mensaje
real. Conviene documentar qué exige cada guarda: hoy un rechazo es silencioso y
la ejecución figura como Success.


## Hallazgo 9 — el nodo de herramienta tumbaba toda la ejecución (CORREGIDO)

`consultar_fuente_oficial` se configuró con credencial `httpBearerAuth`. El nodo
`toolHttpRequest` no la admite: falla con «The type httpBearerAuth is not
supported», y como era un sub-nodo del agente, el error se propagaba y la
ejecución entera terminaba en Error. La persona se quedaba sin respuesta.

Dos correcciones:

1. El nodo ya no lleva credencial (`authentication: none`). La ruta
   `/api/internal/official-sources/lookup` admite ahora dos modos: con prueba de
   origen máquina se puede además indicar una URL concreta y el límite es de 60
   consultas por minuto; sin credencial solo se admite la pregunta, con 20 por
   minuto. Lo que devuelve es contenido público de sedes del Estado sobre una
   lista cerrada, así que no hay secreto que proteger, y ninguna clave tiene que
   viajar hasta n8n.
2. `onError: continueRegularOutput`. Una fuente que no responde no puede volver a
   dejar a nadie sin contestación: el agente recibe el fallo como texto y dice
   que no ha podido verificarlo.

## Nota sobre las pruebas sintéticas

Las cargas enviadas a mano al webhook no completan el flujo: el antirrebote
(`Switch2` + `Wait1` + el desfase de 3 horas del hallazgo 7) las deja dando
vueltas en el bucle de espera indefinidamente, y hubo que pararlas a mano. Los
mensajes reales de WhatsApp terminan en unos 2 segundos. Mientras ese
antirrebote dependa de una suma de horas fija, el flujo no es comprobable sin un
teléfono real: conviene arreglarlo antes que nada.


## Hallazgo 10 — el esquema del nodo de herramienta (CORREGIDO)

Segundo fallo del mismo nodo: con `specifyBody: json` y un `{question}` como
marcador, n8n construye un esquema y valida la llamada del modelo contra él.
Cualquier llamada sin ese campo —incluida la que hace el botón «Ejecutar paso»,
que no manda nada— se rechaza con «La entrada de la herramienta recibida no
coincide con el esquema esperado: Requerido → question».

Corregido con `specifyBody: model`: el modelo escribe el cuerpo entero y la
forma esperada va explicada en la descripción de la herramienta. La validación
la hace la ruta, que responde 400 si falta la pregunta, y `onError:
continueRegularOutput` impide que eso interrumpa la conversación.

Nota: «Ejecutar paso» sobre un sub-nodo de herramienta siempre fallará, porque
no hay agente que le pase una entrada. No es un fallo del nodo.

## Hallazgo 11 — por qué el antirrebote impide probar sin teléfono

`Switch2` continúa cuando `timestampt + 3 horas` es ANTERIOR a `$now`. Con un
mensaje real eso se cumple al instante, porque la marca de tiempo de Evolution
llega tres horas desfasada respecto del reloj del servidor. Con una marca
sintética en hora real, `+3h` cae en el futuro y la ejecución entra en el bucle
`Wait1` y no sale.

Consecuencia práctica: el flujo solo se puede probar de punta a punta con un
mensaje real de WhatsApp. Y en cuanto cambie el horario de verano, ese desfase
de tres horas dejará de cuadrar y los mensajes reales empezarán a quedarse en el
bucle.

Arreglo recomendado: comparar en milisegundos y sin sumar horas fijas —
`{{ new Date(JSON.parse($json.messages.last()).timestampt).getTime() }}` menor o
igual que `{{ Date.now() - 5000 }}`, con operador numérico.


## Hallazgo 12 — el 400 de BUROINSTANT_PERSISTIR era del «Ejecutar paso»

El `Bad request / INVALID_EVENT` aparecía al pulsar «Ejecutar paso» sobre el
nodo: en una ejecución parcial las expresiones se resuelven contra datos
incompletos y el cuerpo sale mal formado. En las ejecuciones reales por webhook
el mismo nodo responde `202 LINK_REQUIRED`, es decir, pasa la firma, pasa el
esquema y la instancia coincide.

Se comprobó además el cuerpo real contra `whatsappWebhookSchema`: válido. Y se
midió qué variantes lo romperían — un `timestamp` con offset (`+02:00` en vez de
`Z`), un `text` vacío o un `type` vacío — para que quede documentado.

La ruta ahora distingue los tres casos en vez de responder `INVALID_EVENT` a
todo: `MALFORMED_JSON`, `INVALID_EVENT` con los campos que fallan, e
`INSTANCE_MISMATCH` diciendo qué instancia llega y cuál se espera. Los nombres
de instancia no son secretos y decirlos ahorra horas.

## Hallazgo 13 — el modo del cuerpo de la herramienta

`specifyBody: model` hace que n8n espere del modelo un campo llamado `body`.
Cuando no lo generaba, el agente moría con «Received tool input did not match
expected schema ✖ Required → at body» y ni `onError` lo salvaba, porque el fallo
ocurre en el agente, no en el nodo.

Vuelto a `specifyBody: json` con el marcador `{question}` y su definición. El
modelo rellena bien ese campo. El error «Requerido → question» que se veía antes
solo sale al pulsar «Ejecutar paso», donde no hay agente que lo rellene.

Estado verificado tras el cambio: ocho ejecuciones seguidas por webhook, todas
Succeeded, con AI Agent, BUROINSTANT_PERSISTIR y whatsapp_response en verde.

## Pendiente que no se toca: reintento de whatsapp_response

La ejecución 42 falló con «The connection timed out» al llamar a Evolution. n8n
sugiere activar «Retry on Fail», pero un reintento ciego sobre un envío puede
duplicar el mensaje si la primera llamada llegó a entregarse antes de expirar.
Queda anotado para decidirlo con criterio, no activado por defecto.
